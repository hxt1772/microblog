/** LocalStorage 键名，与纯静态版本保持一致，便于老数据无缝迁移。 */
export const STORAGE_KEY = 'microblog.posts.v1'

/** 单条动态最大字符数（按字符串 length 计）。 */
export const MAX_LENGTH = 280

/** 本地最多保留的动态条数。 */
export const MAX_ENTRIES = 300

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
