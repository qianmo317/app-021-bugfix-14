import { describe, expect, it } from 'vitest'
import { generatePlan } from '../src/lib/engine'
import { computeFairness } from '../src/lib/fairness'
import { rowZone } from '../src/lib/layout'
import { defaultStudents, makeClass } from './helpers'

// 前/中/后三段统计：每人每周只落在一段，三段次数之和必须等于周数；
// 统计口径必须与座位标注（rowZone / seat.tags）完全一致。
describe('公平性报告：前/中/后三段', () => {
  for (const rows of [3, 4, 5, 6, 7, 8, 9, 12]) {
    it(`${rows} 排：每人三段次数之和等于周数`, () => {
      const cls = makeClass({ rows, cols: 4, weeks: 9, seed: 100 + rows, frontRows: 2 })
      cls.assignments = generatePlan(cls)
      const report = computeFairness(cls)
      expect(report.totalWeeks).toBe(9)
      for (const r of report.rows) {
        expect(r.frontCount + r.middleCount + r.backCount).toBe(9)
      }
      // 全班三段总人次数 = 每周就座人数 × 周数
      const seatedPerWeek = cls.students.length
      expect(report.rows.reduce((s, r) => s + r.frontCount + r.middleCount + r.backCount, 0)).toBe(
        seatedPerWeek * 9,
      )
    })
  }

  it('3 的倍数排数：三段各占 1/3 排，全班每段总次数 = (rows/3)×cols×weeks（满员）', () => {
    const rows = 6
    const cls = makeClass({ rows, cols: 4, weeks: 6, seed: 21, frontRows: 2 })
    cls.assignments = generatePlan(cls)
    const report = computeFairness(cls)
    const sum = (k: 'frontCount' | 'middleCount' | 'backCount') => report.rows.reduce((s, r) => s + r[k], 0)
    const seatsPerZone = (rows / 3) * 4
    expect(sum('frontCount')).toBe(seatsPerZone * 6)
    expect(sum('middleCount')).toBe(seatsPerZone * 6)
    expect(sum('backCount')).toBe(seatsPerZone * 6)
  })

  it('含空位时三段之和仍等于每人实际就座周数', () => {
    const cls = makeClass({ rows: 6, cols: 8, weeks: 5, seed: 9, frontRows: 2 })
    cls.students = defaultStudents(30) // 48 座坐 30 人
    cls.assignments = generatePlan(cls)
    const report = computeFairness(cls)
    for (const r of report.rows) {
      expect(r.frontCount + r.middleCount + r.backCount).toBe(5)
    }
  })

  it('统计区段与座位标签（rowZone）逐周逐人一致', () => {
    const cls = makeClass({ rows: 7, cols: 5, weeks: 6, seed: 55, frontRows: 2 })
    cls.assignments = generatePlan(cls)
    const report = computeFairness(cls)
    const expectCount = new Map(report.rows.map((r) => [r.student.id, { front: 0, middle: 0, back: 0 }]))
    const seatById = new Map(cls.seats.map((s) => [s.id, s]))
    for (const asg of cls.assignments) {
      for (const [seatId, studentId] of Object.entries(asg.map)) {
        const seat = seatById.get(seatId)!
        expect(seat.tags).toContain(rowZone(seat.row, cls.layout))
        expect(seat.tags.filter((t) => t === 'front' || t === 'middle' || t === 'back')).toHaveLength(1)
        expectCount.get(studentId)![rowZone(seat.row, cls.layout)]++
      }
    }
    for (const r of report.rows) {
      expect({ front: r.frontCount, middle: r.middleCount, back: r.backCount }).toEqual(
        expectCount.get(r.student.id),
      )
    }
  })
})
