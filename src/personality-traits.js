// 性格词条库 (FORGE-TRIM): the forge’s protagonist step is input-first —
// the reader types their own trait, and three entries drawn from this
// library sit under the input as one-tap fills (a refresh draws three
// more). The library is fixed editorial stock: 100 entries, each a short
// name plus an 8–16 character behavioural sketch, grouped by temperament.
// Source of truth when re-editing: ~/workspace/sw-prep/personality-100/
// personalities-100.md — keep the two in step.

export const PERSONALITY_TRAITS = [
  { id: 1, name: "杀伐果断", desc: "出手不犹豫，认定的事不回头", group: "爽文主角向" },
  { id: 2, name: "扮猪吃虎", desc: "装傻笑呵呵，谁轻敌谁倒霉", group: "爽文主角向" },
  { id: 3, name: "腹黑记仇", desc: "记仇小本本，报仇连本带利", group: "爽文主角向" },
  { id: 4, name: "狂傲不羁", desc: "规矩不入眼，偏有狂的本钱", group: "爽文主角向" },
  { id: 5, name: "闷声发大财", desc: "好处不声张，悄悄全进兜", group: "爽文主角向" },
  { id: 6, name: "有仇当场报", desc: "不记隔夜仇，当场就了结", group: "爽文主角向" },
  { id: 7, name: "狠人话不多", desc: "能动手不多话，一开口全场静", group: "爽文主角向" },
  { id: 8, name: "护短狂魔", desc: "自己人先护着，外人碰就拼命", group: "爽文主角向" },
  { id: 9, name: "越挫越勇", desc: "摔得越狠，爬得越快", group: "爽文主角向" },
  { id: 10, name: "大心脏", desc: "天塌先吃饭，大场面最稳", group: "爽文主角向" },
  { id: 11, name: "说一不二", desc: "答应的拼命办，狠话必兑现", group: "爽文主角向" },
  { id: 12, name: "输人不输阵", desc: "打输也站着输，气势不认怂", group: "爽文主角向" },
  { id: 13, name: "翻脸无情", desc: "好时掏心，越线立刻陌路", group: "爽文主角向" },
  { id: 14, name: "装弱钓鱼", desc: "示弱钓鱼，轻敌的连坑一起收", group: "爽文主角向" },
  { id: 15, name: "先礼后兵", desc: "笑脸把话说尽，不识趣再翻脸", group: "爽文主角向" },
  { id: 16, name: "赌徒心态", desc: "敢押全部身家，输了认命", group: "爽文主角向" },
  { id: 17, name: "人狠路子野", desc: "从不按套路出牌，什么招都敢用", group: "爽文主角向" },
  { id: 18, name: "天生反骨", desc: "越不让干越要干，专挑权威", group: "爽文主角向" },
  { id: 19, name: "温柔坚定", desc: "轻声细语，认定了比谁都犟", group: "温润治愈向" },
  { id: 20, name: "慢热长情", desc: "动心很慢，放进心里一辈子", group: "温润治愈向" },
  { id: 21, name: "社恐但靠谱", desc: "怕社交，但答应的事从不掉链子", group: "温润治愈向" },
  { id: 22, name: "孩子气老灵魂", desc: "爱玩像没长大，看事比谁都通透", group: "温润治愈向" },
  { id: 23, name: "嘴硬心软", desc: "刀子嘴豆腐心，兜底最快", group: "温润治愈向" },
  { id: 24, name: "温柔理想派", desc: "被现实揍过，眼里还有光", group: "温润治愈向" },
  { id: 25, name: "情绪稳定器", desc: "先接住情绪，谁靠着都安心", group: "温润治愈向" },
  { id: 26, name: "细心体贴鬼", desc: "你随口提的小事，他全记得", group: "温润治愈向" },
  { id: 27, name: "操心命", desc: "嘴上嫌弃，手上不停地操心", group: "温润治愈向" },
  { id: 28, name: "治愈系吃货", desc: "心情再差，也先干饭治愈", group: "温润治愈向" },
  { id: 29, name: "佛系随缘", desc: "争不过就让，总能躲开是非", group: "温润治愈向" },
  { id: 30, name: "阳光开朗", desc: "自带小太阳，进门先笑", group: "温润治愈向" },
  { id: 31, name: "耐心倾听者", desc: "话不多，你说的每句都听完", group: "温润治愈向" },
  { id: 32, name: "默默守护型", desc: "好事做尽不邀功，背后铺路", group: "温润治愈向" },
  { id: 33, name: "心软耳根软", desc: "一求就答应，吃亏还狠不下心", group: "温润治愈向" },
  { id: 34, name: "和气生财脸", desc: "谁都不得罪，笑呵呵攒人缘", group: "温润治愈向" },
  { id: 35, name: "知足常乐", desc: "一碗热汤一个好觉就满足", group: "温润治愈向" },
  { id: 36, name: "迟钝的温柔", desc: "不会情话，照顾总慢半拍到", group: "温润治愈向" },
  { id: 37, name: "偏执深情", desc: "爱就是全世界，容不得背叛", group: "阴郁危险向" },
  { id: 38, name: "病娇黏人", desc: "笑得甜黏得紧，糖里藏锁链", group: "阴郁危险向" },
  { id: 39, name: "冷漠疏离", desc: "对谁隔层玻璃，只对少数人开门", group: "阴郁危险向" },
  { id: 40, name: "疯批美人", desc: "美得惊心，笑着做最狠的事", group: "阴郁危险向" },
  { id: 41, name: "笑面虎", desc: "永远笑眯眯，出手却最狠", group: "阴郁危险向" },
  { id: 42, name: "阴鸷记仇", desc: "伤一笔笔记着，多年后慢慢算", group: "阴郁危险向" },
  { id: 43, name: "占有欲爆棚", desc: "他的人和物，别人多看都不行", group: "阴郁危险向" },
  { id: 44, name: "亦正亦邪", desc: "救人害人全看心情，管不住", group: "阴郁危险向" },
  { id: 45, name: "厌世脸热心肠", desc: "嘴说人类没救，手已经伸出去", group: "阴郁危险向" },
  { id: 46, name: "破罐破摔型", desc: "什么都不在乎，连命都无所谓", group: "阴郁危险向" },
  { id: 47, name: "沉默的疯子", desc: "安静像不存在，爆发吓退全场", group: "阴郁危险向" },
  { id: 48, name: "温柔刀", desc: "语气温柔，手段最利落", group: "阴郁危险向" },
  { id: 49, name: "恋爱脑黑化", desc: "深情被伤透，全换成了算计", group: "阴郁危险向" },
  { id: 50, name: "独狼", desc: "从不组队，受伤自己躲着舔", group: "阴郁危险向" },
  { id: 51, name: "掌控狂", desc: "一切都要在计划内，失控就失眠", group: "阴郁危险向" },
  { id: 52, name: "记恩更记仇", desc: "滴水之恩涌泉报，仇百倍还", group: "阴郁危险向" },
  { id: 53, name: "表面乖巧", desc: "长辈前的乖孩子，背地啥都敢玩", group: "阴郁危险向" },
  { id: 54, name: "夜猫子阴谋家", desc: "白天咸鱼，深夜布好所有局", group: "阴郁危险向" },
  { id: 55, name: "抠门乐观派", desc: "一分掰两半花，对朋友从不眨眼", group: "市井烟火向" },
  { id: 56, name: "话痨自来熟", desc: "五分钟跟陌生人拜把子", group: "市井烟火向" },
  { id: 57, name: "老好人带刺", desc: "好说话有底线，惹急了刺最疼", group: "市井烟火向" },
  { id: 58, name: "杠精正义感", desc: "见不平就杠到底，觉睡得最香", group: "市井烟火向" },
  { id: 59, name: "菜市场哲学家", desc: "摆摊的命，道理全是吃亏学的", group: "市井烟火向" },
  { id: 60, name: "热心肠管家", desc: "谁家有事跑得比亲戚还快", group: "市井烟火向" },
  { id: 61, name: "精打细算", desc: "账比会计细，一分便宜不放过", group: "市井烟火向" },
  { id: 62, name: "憨厚老实人", desc: "不耍心眼，最靠得住的是他", group: "市井烟火向" },
  { id: 63, name: "江湖气大哥", desc: "讲义气重面子，事来了第一个上", group: "市井烟火向" },
  { id: 64, name: "嘴碎心细", desc: "叨叨没完，谁的喜好都记得", group: "市井烟火向" },
  { id: 65, name: "乐天派倒霉蛋", desc: "天天倒霉，天天乐呵", group: "市井烟火向" },
  { id: 66, name: "八卦小灵通", desc: "方圆十里没他不知道的事", group: "市井烟火向" },
  { id: 67, name: "干活不要命", desc: "接了活往死里干，老板最爱", group: "市井烟火向" },
  { id: 68, name: "认死理", desc: "一条道走到黑，撞墙才回头", group: "市井烟火向" },
  { id: 69, name: "小富即安", desc: "赚够吃喝就收手，不熬夜", group: "市井烟火向" },
  { id: 70, name: "爱面子穷大方", desc: "兜里没钱，请客抢着买单", group: "市井烟火向" },
  { id: 71, name: "直肠子热心人", desc: "有话藏不住，有忙帮到底", group: "市井烟火向" },
  { id: 72, name: "邻里活雷锋", desc: "谁家活都找他，还不收钱", group: "市井烟火向" },
  { id: 73, name: "数据至上", desc: "不信眼泪故事，只信数字证据", group: "理性脑向" },
  { id: 74, name: "好奇心过剩", desc: "越不让知道越要弄明白", group: "理性脑向" },
  { id: 75, name: "完美主义", desc: "99 分也难受，非抠到 100", group: "理性脑向" },
  { id: 76, name: "怀疑一切", desc: "天上掉馅饼，先查有没有毒", group: "理性脑向" },
  { id: 77, name: "冷静观察者", desc: "人群边缘看戏，结局早算完", group: "理性脑向" },
  { id: 78, name: "逻辑鬼才", desc: "吵架没输过，歪理说成真理", group: "理性脑向" },
  { id: 79, name: "计划控", desc: "日程排满，意外是最大敌人", group: "理性脑向" },
  { id: 80, name: "风险厌恶者", desc: "宁可少赚，凡事留三条退路", group: "理性脑向" },
  { id: 81, name: "好为人师", desc: "啥都懂一点，逮着机会就开讲", group: "理性脑向" },
  { id: 82, name: "细节控侦探", desc: "你藏的秘密，他一眼看穿", group: "理性脑向" },
  { id: 83, name: "直言不讳", desc: "想啥说啥，留下的都是真朋友", group: "理性脑向" },
  { id: 84, name: "慢工出细活", desc: "出手慢，但东西从不出错", group: "理性脑向" },
  { id: 85, name: "复盘狂魔", desc: "赢输都复盘，同坑绝不踩两次", group: "理性脑向" },
  { id: 86, name: "极简主义者", desc: "东西少话也少，能删的全删", group: "理性脑向" },
  { id: 87, name: "天生军师", desc: "从不上场，后方把局算透", group: "理性脑向" },
  { id: 88, name: "冷知识收藏家", desc: "满脑冷知识，总藏冷门解法", group: "理性脑向" },
  { id: 89, name: "傲娇别扭", desc: "喜欢装嫌弃，耳朵红了嘴还硬", group: "言情适配向" },
  { id: 90, name: "直球选手", desc: "喜欢就说，从不让人猜", group: "言情适配向" },
  { id: 91, name: "深情隐忍", desc: "爱得深藏得更深，委屈自己咽", group: "言情适配向" },
  { id: 92, name: "清醒独立", desc: "爱你不依附，随时能转身", group: "言情适配向" },
  { id: 93, name: "危险好奇心", desc: "明知是坑也要跳下去看看", group: "言情适配向" },
  { id: 94, name: "浪子回头", desc: "为一人收心，全世界让路", group: "言情适配向" },
  { id: 95, name: "木讷深情", desc: "不会甜言蜜语，爱全在细节里", group: "言情适配向" },
  { id: 96, name: "撒娇高手", desc: "想要从不直说，缠到你投降", group: "言情适配向" },
  { id: 97, name: "吃醋大王", desc: "多说句话酸三天，分寸不越界", group: "言情适配向" },
  { id: 98, name: "高冷禁欲", desc: "对谁都淡，唯独对你破例", group: "言情适配向" },
  { id: 99, name: "元气黏人精", desc: "爱笑爱闹爱黏人，阴天也晴", group: "言情适配向" },
  { id: 100, name: "慢热闷骚", desc: "表面正经，心里戏最多", group: "言情适配向" },
]

/**
 * Draw count entries at random, never repeating an id in excludeIds
 * (the batch currently on screen, so a refresh always shows fresh faces).
 * Falls back to the full pool when the exclusion would starve the draw.
 */
export function drawPersonalityTraits(count = 3, excludeIds = [], random = Math.random) {
  const excluded = new Set(excludeIds)
  let pool = PERSONALITY_TRAITS.filter((entry) => !excluded.has(entry.id))
  if (pool.length < count) pool = [...PERSONALITY_TRAITS]
  const drawn = []
  const rest = [...pool]
  while (drawn.length < count && rest.length) {
    drawn.push(rest.splice(Math.floor(random() * rest.length), 1)[0])
  }
  return drawn
}

/** The text a tapped entry writes into the trait input. */
export const personalityTraitText = (entry) => `${entry.name}：${entry.desc}`
