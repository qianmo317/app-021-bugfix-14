import type { LayoutConfig, Seat, SeatTag, Student } from '../types'

// ============ 座位布局 ============

// 前 / 中 / 后三段的唯一划分（座位标注与公平性统计共用，保证口径一致）。
// 前、后各占 ceil(rows/3) 行，其余为中排：三段排数之和恒等于 rows，
// 每排恰好属于一段（互斥、无遗漏、无重复）。
// 例：3 排 → 1/1/1；5 排 → 2/1/2；6 排 → 2/2/2；2 排 → 1/0/1（无中排）。
export function tierSizes(rows: number): { front: number; middle: number; back: number } {
  const edge = Math.max(1, Math.ceil(rows / 3))
  const front = Math.min(edge, rows)
  const back = Math.min(edge, rows - front)
  const middle = Math.max(0, rows - front - back)
  return { front, middle, back }
}

// 某一排（0 = 最靠讲台）属于前 / 中 / 后哪一段
export function rowTier(layout: LayoutConfig, row: number): SeatTag {
  const { front, middle } = tierSizes(layout.rows)
  if (row < front) return 'front'
  if (row < front + middle) return 'middle'
  return 'back'
}

export function seatIdOf(row: number, col: number): string {
  return `r${row}c${col}`
}

// 根据布局配置生成全部座位（含自动标注）
export function buildSeats(layout: LayoutConfig): Seat[] {
  const seats: Seat[] = []
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const tags: SeatTag[] = []
      // 前 / 中 / 后：统一走 rowTier()，每个座位恰好属于一段（互斥且三段合计 = 全部排）
      tags.push(rowTier(layout, r))
      if (isAisleSeat(layout, r, c)) tags.push('aisle')
      const doorCol = layout.doorSide === 'left' ? 0 : layout.cols - 1
      const windowCol = layout.doorSide === 'left' ? layout.cols - 1 : 0
      if (c === doorCol) tags.push('door')
      if (c === windowCol) tags.push('window')
      if (layout.mode === 'groups') tags.push(`group:${groupOf(r, c, layout.cols)}` as SeatTag)
      seats.push({ id: seatIdOf(r, c), row: r, col: c, tags })
    }
  }
  return seats
}

export function isAisleSeat(layout: LayoutConfig, row: number, col: number): boolean {
  void row
  // 靠过道：紧邻某条过道的座位
  for (const a of layout.aisles) {
    if (col === a || col === a + 1) return true
  }
  return false
}

// 小组围坐：每 4 人（2×2）一组
export function groupOf(row: number, col: number, cols: number): string {
  const gRow = Math.floor(row / 2)
  const gCol = Math.floor(col / 2)
  const perRow = Math.ceil(cols / 2)
  return `G${gRow * perRow + gCol + 1}`
}

// ============ 位置分（写进 UI 说明，便于向家长解释） ============
// positionScore(seat) = rowWeight + middleWeight，分数越低位置越好：
//   rowWeight    ∈ [0,2]：0 = 第 1 排（最靠讲台），2 = 最后一排
//   middleWeight ∈ [0,1]：0 = 正中一列，1 = 最边上一列
export function positionScore(seat: Seat, layout: LayoutConfig): number {
  const rowWeight = layout.rows > 1 ? (seat.row / (layout.rows - 1)) * 2 : 0
  const half = (layout.cols - 1) / 2
  const middleWeight = half > 0 ? Math.abs(seat.col - half) / half : 0
  return rowWeight + middleWeight
}

// 「中间列」集合：到中轴距离 ≤ 列宽一半的一半（居中连续块）。
// 视力「需中间」学生的硬约束范围，也是公平性统计的「中间列次数」。
export function middleColSet(layout: LayoutConfig): Set<number> {
  const half = (layout.cols - 1) / 2
  const out = new Set<number>()
  for (let c = 0; c < layout.cols; c++) {
    if (Math.abs(c - half) <= half / 2 + 1e-9) out.add(c)
  }
  return out
}

// ============ 预计算索引（引擎性能关键） ============
export interface SeatIndex {
  layout: LayoutConfig
  seats: Seat[]
  byId: Map<string, Seat>
  posScore: Float64Array // 按座位下标
  deskmates: number[][] // 同桌（行列模式：同排左右相邻且无过道；小组模式：同组全部成员）
  vertical: { up: number; down: number }[] // 同列前后（身高排序用）
  isFrontRows: (row: number, n: number) => boolean
}

export function buildSeatIndex(seats: Seat[], layout: LayoutConfig): SeatIndex {
  const byId = new Map(seats.map((s) => [s.id, s]))
  const idxOf = (s: Seat) => s.row * layout.cols + s.col
  const n = seats.length
  const posScore = new Float64Array(n)
  const deskmates: number[][] = Array.from({ length: n }, () => [])
  const vertical: { up: number; down: number }[] = Array.from({ length: n }, () => ({ up: -1, down: -1 }))

  for (const s of seats) posScore[idxOf(s)] = positionScore(s, layout)

  if (layout.mode === 'groups') {
    const byGroup = new Map<string, Seat[]>()
    for (const s of seats) {
      const g = s.tags.find((t) => t.startsWith('group:'))
      if (!g) continue
      const list = byGroup.get(g) ?? []
      list.push(s)
      byGroup.set(g, list)
    }
    for (const s of seats) {
      const g = s.tags.find((t) => t.startsWith('group:'))
      if (!g) continue
      deskmates[idxOf(s)] = (byGroup.get(g) ?? []).filter((o) => o.id !== s.id).map(idxOf)
    }
  } else {
    for (const s of seats) {
      const list = deskmates[idxOf(s)]
      const left = byId.get(seatIdOf(s.row, s.col - 1))
      const right = byId.get(seatIdOf(s.row, s.col + 1))
      const gapLeft = layout.aisles.includes(s.col - 1)
      const gapRight = layout.aisles.includes(s.col)
      if (left && !gapLeft) list.push(idxOf(left))
      if (right && !gapRight) list.push(idxOf(right))
    }
  }

  for (const s of seats) {
    const up = byId.get(seatIdOf(s.row - 1, s.col))
    const down = byId.get(seatIdOf(s.row + 1, s.col))
    vertical[idxOf(s)] = { up: up ? idxOf(up) : -1, down: down ? idxOf(down) : -1 }
  }

  return {
    layout,
    seats,
    byId,
    posScore,
    deskmates,
    vertical,
    isFrontRows: (row, frontRows) => row < frontRows,
  }
}

// 学生展示用的标记描述（图标 + 文字，不能只用颜色）
export function visionLabel(v: Student['vision']): string {
  if (v === 'front_required') return '近视·需前排'
  if (v === 'middle_required') return '需中间'
  return ''
}

export function specialLabel(s: Student['special']): string {
  const out: string[] = []
  if (s?.includes('hearing')) out.push('听力')
  if (s?.includes('mobility')) out.push('行动不便')
  return out.join('、')
}
