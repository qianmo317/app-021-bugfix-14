import { describe, expect, it } from 'vitest'
import { buildSeatIndex, buildSeats, frontThirdRows, middleColSet, positionScore, rowZone } from '../src/lib/layout'
import type { LayoutConfig } from '../src/types'

const layout: LayoutConfig = { rows: 3, cols: 6, aisles: [2], mode: 'rows', doorSide: 'right' }

describe('前/中/后三段划分（座位标注与公平性统计的共同口径）', () => {
  const L = (rows: number): LayoutConfig => ({ rows, cols: 4, aisles: [], mode: 'rows', doorSide: 'right' })

  it('每个座位恰好带一个区段标签，且与 rowZone 一致', () => {
    for (const rows of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const seats = buildSeats(L(rows))
      for (const s of seats) {
        const zones = s.tags.filter((t) => t === 'front' || t === 'middle' || t === 'back')
        expect(zones, `rows=${rows} ${s.id} tags=${s.tags.join(',')}`).toEqual([rowZone(s.row, L(rows))])
      }
    }
  })

  it('三段恰好覆盖全部排、同段连续不回跳；3 的倍数时各占 1/3', () => {
    const order = { front: 0, middle: 1, back: 2 } as const
    for (const rows of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const counts = { front: 0, middle: 0, back: 0 }
      for (let r = 0; r < rows; r++) {
        const z = rowZone(r, L(rows))
        counts[z]++
        if (r > 0) expect(order[z]).toBeGreaterThanOrEqual(order[rowZone(r - 1, L(rows))])
      }
      expect(counts.front + counts.middle + counts.back).toBe(rows)
      if (rows % 3 === 0) {
        const t = rows / 3
        expect(counts).toEqual({ front: t, middle: t, back: t })
        expect(frontThirdRows(rows)).toBe(t)
      }
    }
  })

  it('前后各占 ceil(rows/3)，中间补齐', () => {
    // ceil 口径：rows=4 前2(r0r1) 后2(r2r3) 中间0；rows=5 前2 中1 后2；rows=6 各2
    expect([0, 1, 2, 3].map((r) => rowZone(r, L(4)))).toEqual(['front', 'front', 'back', 'back'])
    expect([0, 1, 2, 3, 4].map((r) => rowZone(r, L(5)))).toEqual(['front', 'front', 'middle', 'back', 'back'])
    expect([0, 1, 2, 3, 4, 5].map((r) => rowZone(r, L(6)))).toEqual([
      'front',
      'front',
      'middle',
      'middle',
      'back',
      'back',
    ])
  })
})

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
})
