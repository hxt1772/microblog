import { MAX_LENGTH } from '../../shared/constants'

/** 单条动态最大字符数与最多保留条数定义在 `shared/constants.ts`，此处重导出保持既有导入路径。 */
export { MAX_ENTRIES, MAX_LENGTH } from '../../shared/constants'

/** 接近上限的提示阈值（90%）。 */
export const NEAR_LENGTH_THRESHOLD = Math.floor(MAX_LENGTH * 0.9)

/** 输入框自动增高的像素上限。 */
export const TEXTAREA_MAX_HEIGHT = 320

/** 相对时间与跨天检测的刷新间隔。 */
export const TICK_INTERVAL_MS = 60 * 1000

/** Toast 停留时长。 */
export const TOAST_DURATION_MS = 2600

/** 发布按钮「已发布」反馈时长。 */
export const SUCCESS_FLASH_MS = 900

/** 趋势图展示的天数（含今天）。 */
export const WEEK_DAYS = 7

/** 柱状图最小可见高度百分比。 */
export const MIN_BAR_PERCENT = 8

/** 统计数字跳变动画时长。 */
export const BUMP_DURATION_MS = 600
