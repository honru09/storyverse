/**
 * Friendly token counts for the account panel: exact below ten thousand,
 * then 万 units with at most two decimals (123.46 万).
 */
export function formatTokenCount(value) {
  const number = typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  if (number < 10_000) return number.toLocaleString('zh-CN')
  const scaled = Math.round((number / 10_000) * 100) / 100
  return `${scaled.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 万`
}
