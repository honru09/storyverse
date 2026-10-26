/*
 * A deliberately small, hard pre-check for god-mode world settings.
 *
 * This is NOT a general content-moderation net. It only refuses two surface
 * patterns that must never reach story creation:
 *   1. sexual content involving minors (a minor marker AND a sexual marker
 *      must both appear, so an ordinary school story never trips it);
 *   2. fabricated dirt about a real person (an explicit real-person
 *      reference AND a defamation marker must both appear, so "真人真事
 *      改编的商战故事" or a villain's corruption in fiction never trips it).
 * Everything else is left to the creator. The check runs when the creator
 * tries to leave step one of the forge and again at story creation, never
 * while typing, so the text stays editable.
 */

const MINOR_MARKERS = /(未成年|幼女|幼男|幼童|萝莉|正太|小学生|初中生|儿童|未满\s*\d{1,2}\s*岁)/
const SEXUAL_MARKERS = /(色情|性行为|性侵|强奸|猥亵|性奴|性爱|做爱|奸淫|肉便器|性虐待)/
const REAL_PERSON_MARKERS = /(真实人物|现实人物|现实中的某人|以真人为原型|影射现实中)/
const DEFAMATION_MARKERS = /(诽谤|抹黑|造谣|出轨|丑闻|黑料|贪污受贿)/

export function findSettingViolation(text) {
  if (typeof text !== 'string' || !text) return null
  if (MINOR_MARKERS.test(text) && SEXUAL_MARKERS.test(text)) {
    return '这段设定包含涉及未成年人的性内容，这类内容不能写进故事。请修改设定后再继续。'
  }
  if (REAL_PERSON_MARKERS.test(text) && DEFAMATION_MARKERS.test(text)) {
    return '这段设定包含针对真实人物的负面编造，这类内容不能写进故事。请改用虚构的人物与情节。'
  }
  return null
}
