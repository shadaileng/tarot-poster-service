// 海报相关类型定义
// 与前端 src/utils/poster/types.ts 保持一致

export interface PosterCardInput {
  /** 牌面图片 URL */
  image: string
  /** 牌名 */
  name: string
  /** 在牌阵中的位置 */
  position: string
  /** 正位/逆位 */
  orientation: 'upright' | 'reversed'
  /** 含义文本 */
  meaning: string
  /** 关键词 */
  keywords: string[]
  /** 花色类型（major/minor/court） */
  type: string
  /** 大阿卡纳序号（小阿卡纳为 -1） */
  number: number
}

export interface PosterData {
  cards: PosterCardInput[]
  question: string
  spreadName: string
  interpretation?: string
  date: string
}
