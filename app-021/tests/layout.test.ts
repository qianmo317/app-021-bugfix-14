import { describe, expect, it } from 'vitest'
import { buildSeatIndex, buildSeats, middleColSet, positionScore, rowTier, tierSizes } from '../src/lib/layout'
import type { LayoutConfig } from '../src/types'

const layout: LayoutConfig = { rows: 3, cols: 6, aisles: [2], mode: 'rows', doorSide: 'right' }

describe('座位布局', () => {
  it('生成行列齐全的座位并自动标注', () => {
    const seats = buildSeats(layout)
    expect(seats).toHaveLength(18)
    const r0c0 = seats.find((s) => s.id === 'r0c0')!
    expect(r0c0.tags).toContain('front')
    expect(r0c0.tags).toContain('window') // 门在右，窗在左
    const r2c5 = seats.find((s) => s.id === 'r2c5')!
    expect(r2c5.tags).toContain('back')
    expect(r2c5.tags).toContain('door')
    const r1c2 = seats.find((s) => s.id === 'r1c2')!
    expect(r1c2.tags).toContain('middle')
    expect(r1c2.tags).toContain('aisle') // 过道在 col2|col3 之间
    const r1c3 = seats.find((s) => s.id === 'r1c3')!
    expect(r1c3.tags).toContain('aisle')
  })

  it('位置分：越靠前、越靠中间分数越低', () => {
    const seats = buildSeats(layout)
    const byId = new Map(seats.map((s) => [s.id, s]))
    expect(positionScore(byId.get('r0c2')!, layout)).toBeLessThan(positionScore(byId.get('r2c0')!, layout))
    expect(positionScore(byId.get('r1c2')!, layout)).toBeLessThan(positionScore(byId.get('r1c0')!, layout))
    expect(positionScore(byId.get('r0c2')!, layout)).toBeCloseTo(positionScore(byId.get('r0c3')!, layout), 10)
  })

  it('中间列集合：居中连续块', () => {
    expect(middleColSet(layout)).toEqual(new Set([2, 3]))
    expect(middleColSet({ ...layout, cols: 5 })).toEqual(new Set([1, 2, 3]))
    expect(middleColSet({ ...layout, cols: 8 })).toEqual(new Set([2, 3, 4, 5]))
  })

  it('同桌 = 同排相邻且中间无过道', () => {
    const seats = buildSeats(layout)
    const idx = buildSeatIndex(seats, layout)
    const idOf = (r: number, c: number) => r * 6 + c
    // r1: c0-c1 相邻同桌；c1 与 c2 之间无过道（过道在 c2|c3）
    expect(idx.deskmates[idOf(1, 0)]).toContain(idOf(1, 1))
    expect(idx.deskmates[idOf(1, 1)]).toContain(idOf(1, 2))
    // 过道隔开 c2 与 c3
    expect(idx.deskmates[idOf(1, 2)]).not.toContain(idOf(1, 3))
    expect(idx.deskmates[idOf(1, 3)]).not.toContain(idOf(1, 2))
    // 前后不是同桌
    expect(idx.deskmates[idOf(1, 1)]).not.toContain(idOf(0, 1))
  })

  it('小组围坐模式：同组成员互为同桌', () => {
    const g: LayoutConfig = { rows: 2, cols: 4, aisles: [], mode: 'groups', doorSide: 'left' }
    const idx = buildSeatIndex(buildSeats(g), g)
    const g1 = idx.deskmates[0] // r0c0 → G1
    expect(g1).toHaveLength(3) // r0c1, r1c0, r1c1
  })

  it('前/中/后三段：三段排数之和恒等于总行数（前/后各 ceil(rows/3)）', () => {
    for (let rows = 2; rows <= 12; rows++) {
      const { front, middle, back } = tierSizes(rows)
      expect(front + middle + back, `rows=${rows} 三段之和`).toBe(rows)
      expect(front, `rows=${rows} 前排非空`).toBeGreaterThanOrEqual(1)
      expect(back, `rows=${rows} 后排非空`).toBeGreaterThanOrEqual(1)
    }
    // 代表性划分
    expect(tierSizes(3)).toEqual({ front: 1, middle: 1, back: 1 })
    expect(tierSizes(4)).toEqual({ front: 2, middle: 0, back: 2 })
    expect(tierSizes(5)).toEqual({ front: 2, middle: 1, back: 2 })
    expect(tierSizes(6)).toEqual({ front: 2, middle: 2, back: 2 })
    expect(tierSizes(7)).toEqual({ front: 3, middle: 1, back: 3 })
    expect(tierSizes(8)).toEqual({ front: 3, middle: 2, back: 3 })
    expect(tierSizes(9)).toEqual({ front: 3, middle: 3, back: 3 })
  })

  it('每一排恰好属于一段（互斥、无遗漏）', () => {
    for (let rows = 2; rows <= 12; rows++) {
      const l: LayoutConfig = { rows, cols: 4, aisles: [], mode: 'rows', doorSide: 'right' }
      const tiers = Array.from({ length: rows }, (_, r) => rowTier(l, r))
      expect(new Set(tiers).size, `rows=${rows} 应至少覆盖前/后两段`).toBeGreaterThanOrEqual(2)
      const counts: Record<'front' | 'middle' | 'back', number> = { front: 0, middle: 0, back: 0 }
      for (const t of tiers) {
        expect(t, `rows=${rows} 每排段标签合法`).toMatch(/^(front|middle|back)$/)
        counts[t as 'front' | 'middle' | 'back']++
      }
      expect(counts, `rows=${rows}`).toEqual(tierSizes(rows))
    }
  })

  it('每个座位恰好带一个前/中/后段标签（不再重叠）', () => {
    for (let rows = 2; rows <= 12; rows++) {
      const l: LayoutConfig = { rows, cols: 5, aisles: [2], mode: 'rows', doorSide: 'right' }
      const seats = buildSeats(l)
      for (const s of seats) {
        const tierTags = s.tags.filter((t) => t === 'front' || t === 'middle' || t === 'back')
        expect(tierTags, `${s.id} 应恰好一个段标签`).toHaveLength(1)
        expect(tierTags[0]).toBe(rowTier(l, s.row))
      }
    }
  })
})
