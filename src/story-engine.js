/*
 * StoryWeave's small domain engine.
 *
 * This module is deliberately deterministic: it is not an AI model, makes no
 * network requests, and never uses an artificial sleep.  The templates are a
 * local prototype for the state machine that a model-backed service can later
 * implement.
 *
 * Domain terms:
 * - A chapter index is zero based (0..total-1, total from the length mode).
 * - `chapterIndex` is the next chapter that can be accepted.  It starts at 0
 *   and stays at total-1 after the finale.
 * - Chapter-end choices are RETIRED (2026-10-27 intervention batch): the
 *   engine mints no choices, generation never consults a recorded choice,
 *   and the reader offers none.  The deterministic choice tables survive
 *   only as `legacyChoiceAt`, so pre-retirement saves keep validating and
 *   their already-written prose keeps its read-time repair; a choice stored
 *   on an old story is inert data, never a gate.  Steering now belongs to
 *   interventions: reader-injected external-force events that land in the
 *   next unread chapter and nowhere else (see the intervention section).
 */

import { normalizeLorebookEntries } from './lorebook.js'

export const GENRES = [
  {
    id: 'mist',
    label: '奇幻',
    world: '沉潮港',
    title: '沉潮港纪事',
    tagline: '潮汐记得每一个名字',
    description: '沉潮港被潮水围住，镇上的潮汐钟会改写记忆，雾里漂来一封不该抵达的信。',
    color: 'coral',
    symbol: '◒',
    location: '第七码头',
    spawnPoints: [
      { id: 'pier', name: '第七码头', hook: '在码头仓库的麻袋堆里醒来，潮水正漫过门槛，怀里揣着一封不是你的信。', situation: '市井' },
      { id: 'raft', name: '疍家渔排', hook: '在渔排的吊床上醒来，排主敲着你的船板，说你已经欠了他三网鱼的债。', situation: '落魄' },
      { id: 'wreck', name: '沉船甲板', hook: '在一艘搁浅沉船的甲板上醒来，脚下的船舱里传来一下、又一下的敲击声。', situation: '危险' },
      { id: 'lighthouse', name: '灯塔守夜屋', hook: '在灯塔的守夜屋里醒来，昨夜的守夜日志不是你写的，字迹却和你一模一样。', situation: '隐秘' },
      { id: 'shipowner-house', name: '船王大宅', hook: '在船王大宅的顶层醒来，窗外是整个港口，桌上摊着一份等你签字的航线变更——签了，三个码头的人就没饭吃。', situation: '近权力' },
      { id: 'flagship-cabin', name: '旗舰船长舱', hook: '在家族旗舰的船长舱里醒来，老舵手在门外候着，只等你一句话，可你连这条船要去哪儿都不知道。', situation: '近权力' },
      { id: 'clocktower', name: '钟楼值房', hook: '在潮汐钟楼的值房里醒来，今晨的钟点是你排的，可表上有一格时刻，你怎么也想不起来是谁填的。', situation: '任职' },
      { id: 'inn-attic', name: '无名客栈顶楼', hook: '在港边客栈的顶楼醒来，店家说你半月前就住下了，房钱却是一个你从没见过的人预付的。', situation: '隐秘' },
      { id: 'fishmarket', name: '鱼市后巷', hook: '在鱼市后巷的摊子底下醒来，晨市还没开张，鱼贩们已经把最肥的一筐留在了你脚边。', situation: '市井' },
      { id: 'bridge-cave', name: '桥洞避潮处', hook: '在桥洞的避潮处醒来，昨夜的潮水就停在你脚边一寸，和你挤一张草席的人，天亮就不见了。', situation: '落魄' },
      { id: 'old-shipfirm', name: '老船行', hook: '在贴了三年封条的老船行里醒来，你从后窗翻进来睡的——这屋子，曾经是你家的。', situation: '落魄' },
      { id: 'reef-cave', name: '雾岛礁洞', hook: '在雾岛的礁洞里醒来，洞口的淡水罐是满的，你不记得自己接过雨，也不想知道是谁接的。', situation: '隐秘' },
      { id: 'foreign-ship', name: '外来客船甲板', hook: '在一艘刚进港的外来客船上醒来，你是全船唯一听不懂本地话的人，而所有人都在等你先开口。', situation: '外来' },
      { id: 'exile-ship', name: '流放船底舱', hook: '在流放船的底舱醒来，船靠岸只停一炷香，你必须在这炷香里决定：留下，还是跳进雾里。', situation: '危险' },
      { id: 'warehouse-room', name: '货栈二楼客房', hook: '在货栈二楼的客房醒来，你的货还压在楼下，买家改了三次价，今早退潮之前必须出手。', situation: '市井' },
    ],
  },
  {
    id: 'cultivation',
    label: '修仙',
    world: '青岚宗',
    title: '借火登天',
    tagline: '凡人也能向天借火',
    description: '灵脉正在枯竭，青岚宗把最后的火种藏进凡人的梦里，等一个不信命的人来取。',
    color: 'gold',
    symbol: '✦',
    location: '后山灵田',
    spawnPoints: [
      { id: 'hillside-field', name: '后山灵田', hook: '在灵田看棚的草席上醒来，昨夜借来的火种自己挪了位置，就搁在你枕边。', situation: '落魄' },
      { id: 'temple', name: '山神破庙', hook: '在山神庙的供桌底下醒来，庙里只剩你和一尊裂了的菩萨，香炉里半炷香还没烧完。', situation: '隐秘' },
      { id: 'village', name: '山脚村落', hook: '在村口老槐树下的草垛里醒来，全村人都假装没看见你，只有村长家的狗一直盯着你。', situation: '市井' },
      { id: 'woodshed', name: '外门柴房', hook: '在外门柴房的柴堆上醒来，管事在门外说：醒了就先挑三百担水，挑不完不许吃饭。', situation: '落魄' },
      { id: 'scripture-attic', name: '主峰藏经阁', hook: '在主峰藏经阁的顶层醒来，师父留给你的那页功法被人抽走了，只留下一句新批注：别练。', situation: '近权力' },
      { id: 'heir-dwelling', name: '真传洞府', hook: '在自己的洞府里醒来，洞门外跪着三个求你收徒的人，可你入门也才三年。', situation: '近权力' },
      { id: 'law-hall', name: '执法堂值房', hook: '在执法堂的值房里醒来，案头多了一份没签完的判令——被告，是和你同屋住了三年的师弟。', situation: '任职' },
      { id: 'gate-post', name: '山门值守亭', hook: '在山门值守亭里醒来，昨夜的访客簿上多了一行：来人没有影子，你却照规矩放了行。', situation: '任职' },
      { id: 'blank-stele', name: '无字碑林', hook: '在后山的无字碑林里醒来，最新的一块碑上刻着你的生辰，落款却比你出生早了五十年。', situation: '隐秘' },
      { id: 'branch-shrine', name: '支脉祠堂', hook: '在废弃的支脉祠堂里醒来，牌位倒了大半，你家的那块却被人单独扶正过，灰还是新的。', situation: '落魄' },
      { id: 'observatory', name: '云海观星台', hook: '在云海边的观星台上醒来，你十年没和人说过话，今早却有个孩子坐在台边，说等你开口等了三天。', situation: '隐秘' },
      { id: 'tea-shed', name: '山门茶棚', hook: '在山门外的茶棚里醒来，你是来投宗的，可简章上写着：今年只收一个外乡人，茶棚里却坐了四个。', situation: '外来' },
      { id: 'cliff-cell', name: '戒律崖石牢', hook: '在戒律崖下的石牢里醒来，送饭的窗口只开一条缝，送饭的人说：你最好别让他们想起你还活着。', situation: '危险' },
      { id: 'market-shed', name: '坊市货棚', hook: '在山下坊市的货棚里醒来，你的货是三车不值钱的凡铁，可宗门采购的人天没亮就来问了三遍价。', situation: '市井' },
    ],
  },
  {
    id: 'neon',
    label: '赛博',
    world: '霓虹下城',
    title: '雨幕备份',
    tagline: '记忆可以删改，雨声不行',
    description: '霓虹下城是巨型都市的下层区：情绪可以租赁，记忆可以删改，雨水里藏着一份无主的人格备份。',
    color: 'mint',
    symbol: '⌁',
    location: '下城回收站',
    spawnPoints: [
      { id: 'recycle', name: '下城回收站', hook: '在回收站的窝棚里醒来，手边多了一块发烫的无主芯片，烫得你一下子清醒过来。', situation: '市井' },
      { id: 'slum', name: '下城贫民窟', hook: '在集装箱顶层醒来，楼下整条巷子的人正为一桶净水排队，队尾已经排到了你脚下。', situation: '落魄' },
      { id: 'capsule', name: '9号胶囊舱', hook: '在胶囊舱里醒来，舱门上贴着一张欠费单，署名是你从没用过的名字。', situation: '隐秘' },
      { id: 'clinic', name: '地下诊所后间', hook: '在地下诊所的后间醒来，医生说你的义体里多了一段记忆，不属于你，也不属于任何登记在册的人。', situation: '危险' },
      { id: 'corp-penthouse', name: '财团顶层公寓', hook: '在财团顶层的公寓里醒来，落地窗外是整座下城，桌上的继承文件只差你的虹膜确认——确认完，有人就会死。', situation: '近权力' },
      { id: 'memory-vault', name: '记忆保险库', hook: '在财团私人的记忆保险库里醒来，库里存着你从三岁起的全部备份，唯独昨晚那一段，是空的。', situation: '近权力' },
      { id: 'bureau-night', name: '管理局夜班室', hook: '在管理局的夜班室里醒来，你昨晚签发的驱逐令今早生效，名单上的第一个名字，是你的房东。', situation: '任职' },
      { id: 'audit-desk', name: '稽查局工位', hook: '在稽查局的工位上醒来，屏幕上还开着一份没查完的档案——被稽查的那个人，是你自己。', situation: '任职' },
      { id: 'night-market', name: '夜市维修摊', hook: '在夜市维修摊的帘子后醒来，摊主说你昨晚修好了一台不该修好的机器，买家今早会来取，也会来封口。', situation: '市井' },
      { id: 'old-flat', name: '旧公寓', hook: '在一间被回收的旧公寓里醒来，这是你家破产前住的地方，墙上你小时候的身高线还在，回收的人中午就来。', situation: '落魄' },
      { id: 'water-tower', name: '天台水塔', hook: '在断网区天台的水塔里醒来，你躲开所有信号活了七年，今早塔外多了一部还在响的电话——不是你的。', situation: '隐秘' },
      { id: 'repatriation-cabin', name: '遣返中转舱', hook: '在中转舱里醒来，你是从上城被遣返下来的人，遣返令上没写原因，只写着：此人不得再次上行。', situation: '外来' },
      { id: 'exile-gate', name: '放逐闸口', hook: '在放逐闸口的铁笼边醒来，闸门每开一次放一个人出去，出去的人没有一个回来过——下一班，轮到你。', situation: '危险' },
      { id: 'black-market', name: '黑市仓库夹层', hook: '在黑市仓库的夹层里醒来，你的货就堆在脚下，货主昨晚跑了，债主和买家今早都会到。', situation: '市井' },
    ],
  },
  {
    id: 'city',
    label: '都市',
    world: '长宁街',
    title: '凌晨四点的长宁街',
    tagline: '所有错过的人，都有一次重逢',
    description: '长宁街永不打烊，把陌生人的愿望串在一起，等一个人按下回车。',
    color: 'violet',
    symbol: '✧',
    location: '长宁街口',
    spawnPoints: [
      { id: 'street-corner', name: '长宁街口', hook: '在街口的长椅上醒来，手机只剩百分之一的电，备忘录里多了一行你没写过的字。', situation: '市井' },
      { id: 'noodle-kitchen', name: '面馆后厨', hook: '在面馆后厨的折叠床上醒来，老板娘头也不抬：揉了这盆面，抵昨晚的床钱。', situation: '落魄' },
      { id: 'netcafe', name: '网吧包间', hook: '在二十四小时网吧的包间里醒来，屏幕上是通宵的游戏，和一条陌生人留给你的话。', situation: '隐秘' },
      { id: 'convenience', name: '夜班便利店', hook: '在便利店夜班的柜台后醒来，监控回放里，凌晨三点的你正对着一排空货架说话。', situation: '市井' },
      { id: 'old-house', name: '老宅顶层套房', hook: '在家族老宅的顶层套房醒来，楼下正在开家庭会议，议题是你——而你昨晚签过的那份文件，今早不见了。', situation: '近权力' },
      { id: 'chairman-office', name: '董事长办公室', hook: '在董事长办公室的沙发上醒来，你在这里睡了一夜，秘书在门外说：九点的董事会，要表决的正是你。', situation: '近权力' },
      { id: 'street-office', name: '街道办值班室', hook: '在街道办的值班室醒来，昨晚的调解记录你签了字，可当事人今早说，那句话不是他说的。', situation: '任职' },
      { id: 'govt-hall', name: '政务大厅后台', hook: '在政务大厅的后台醒来，你经手的最后一个文件袋是空的，而监控刚好在那一个小时坏了。', situation: '任职' },
      { id: 'storage-room', name: '顶楼储藏间', hook: '在老公寓顶楼的储藏间醒来，里面堆满写着你名字的旧物，可你从没住过这条街。', situation: '隐秘' },
      { id: 'park-bench', name: '桥下公园长椅', hook: '在桥下公园的长椅上醒来，晨练的大爷给你留了个包子，包子底下压着纸条：今晚别睡这儿。', situation: '落魄' },
      { id: 'old-shop', name: '老店面', hook: '在自家被拍卖的老店面里醒来，招牌还没摘，你在柜台后面睡了最后一夜——你家三代人，都在这个柜台后面站过。', situation: '落魄' },
      { id: 'roof-tank', name: '天台水箱间', hook: '在老楼天台的水箱间醒来，你在这里住了两年没人知道，今早却有一束花放在门口，没有卡片。', situation: '隐秘' },
      { id: 'coach-station', name: '长途车站', hook: '在长途客车的最后一排醒来，车到了终点长宁街，司机说你上车时给的那个地址，这条街上没有。', situation: '外来' },
      { id: 'evicted-room', name: '退租屋', hook: '在被退租的出租屋里醒来，行李已经被打包放在门外，房东说不是赶你，是这栋楼今晚要拆。', situation: '危险' },
      { id: 'wholesale-stall', name: '批发市场档口', hook: '在批发市场的档口里醒来，你的货昨晚刚到，隔壁档口的人说，昨夜有三拨人来问过价——没有一拨是买家。', situation: '市井' },
    ],
  },
  {
    id: 'court',
    label: '古言',
    world: '长乐宫',
    title: '宫墙深处',
    tagline: '一步走错，满盘皆输',
    description: '长乐宫里，位分就是命数；一封没寄出的家书，能改写三个人的命运。',
    color: 'crimson',
    symbol: '❖',
    location: '长乐宫偏殿',
    spawnPoints: [
      { id: 'side-palace', name: '长乐宫偏殿', hook: '在偏殿耳房的窄榻上醒来，掌事姑姑留了话：昨夜的册封礼，你缺席了。', situation: '近权力' },
      { id: 'emperor-room', name: '皇帝的卧室', hook: '在龙床边的脚踏上醒来，你不记得自己是怎么进来的，皇帝也不记得——这才是最麻烦的地方。', situation: '危险' },
      { id: 'cold-palace', name: '冷宫偏殿', hook: '在冷宫的井台边醒来，手边一碗粥还温着，是谁送来的，宫里没人承认。', situation: '落魄' },
      { id: 'kitchen-yard', name: '御膳房后院', hook: '在御膳房后院的柴棚里醒来，怀里抱着一坛御酒——它不该在你手上。', situation: '市井' },
      { id: 'inner-court', name: '内侍值房', hook: '在内侍的值房里醒来，今晨要宣的旨意就压在你枕头底下，你还没看，满宫的人却都已经在按旨意行事了。', situation: '任职' },
      { id: 'astro-tower', name: '废弃占星台', hook: '在废弃的占星台上醒来，台上的星盘停在你出生的那一年，守台的老宫人说：它等了你二十年。', situation: '隐秘' },
      { id: 'old-study', name: '先帝旧书房', hook: '在先帝的旧书房里醒来，书房封了二十年，你手里的钥匙是母亲临终塞给你的，她说：别用。', situation: '隐秘' },
      { id: 'laundry', name: '浣衣局通铺', hook: '在浣衣局的通铺上醒来，你是新进宫的小宫人，管事嬷嬷说，昨夜有人点了你的名字——点名的人，你惹不起。', situation: '市井' },
      { id: 'menial-room', name: '掖庭杂役房', hook: '在掖庭的杂役房里醒来，你是宫里最低等的人，可今早派给你的差事，是替一位贵人送一封不能见光的信。', situation: '落魄' },
      { id: 'seized-house', name: '被抄没的旧宅', hook: '在自家被抄没的旧宅里醒来，封条贴在门上，你从后门进来，只为取走母亲藏在灶台下的一样东西。', situation: '落魄' },
      { id: 'herb-hut', name: '宫后山草庐', hook: '在宫后山的草庐里醒来，你是退隐十年的老太医，今早山下来了人，跪在庐外不肯走。', situation: '隐秘' },
      { id: 'envoy-lodge', name: '鸿胪寺客馆', hook: '在鸿胪寺的客馆里醒来，你是外邦来的使节，可你的国书是假的——真的那一份，在来的路上沉了江。', situation: '外来' },
      { id: 'opera-backstage', name: '戏班后台', hook: '在戏班的后台醒来，你是跟着戏班混进宫的，班主说唱完今晚就走，可你的名字出现在了留宫名单上。', situation: '外来' },
      { id: 'exile-cart', name: '宫门放逐车', hook: '在宫门外的放逐车上醒来，你是被贬出京的人，车还没走，宫里又追出一道口谕，让你把一句话带给三千里外的人。', situation: '危险' },
      { id: 'supply-office', name: '宫市采买行', hook: '在宫市采买行的账房里醒来，你是给宫里供货的商人，昨夜的账对不上——多出来的那一笔，写着你的名字。', situation: '市井' },
    ],
  },
  {
    id: 'frontier',
    label: '科幻',
    world: '七号前哨站',
    title: '星环以远',
    tagline: '旧世界的本事，在这里一文不值',
    description: '七号前哨站之外是辐射废土；配给卡决定谁先活下去，旧地图全是错的。',
    color: 'steel',
    symbol: '◎',
    location: '七号站配给舱',
    spawnPoints: [
      { id: 'ration-cabin', name: '七号站配给舱', hook: '在配给舱的隔间里醒来，你的配给卡余额是全站最低，今天的氧气份额还差一半。', situation: '落魄' },
      { id: 'cryo', name: '冷冻休眠舱', hook: '被强制唤醒时，你看见休眠舱盖内侧刻着一行字：别相信唤醒你的人。', situation: '危险' },
      { id: 'obs-tower', name: '观测塔值班室', hook: '在观测塔的值班室里醒来，值班日志停在三十年前，望远镜还对着那片空白星域。', situation: '隐秘' },
      { id: 'cargo', name: '货舱夹层', hook: '在货舱的夹层里醒来，这批“货物”里，你是唯一一个会呼吸的。', situation: '危险' },
      { id: 'hq-cabin', name: '总部私人舱', hook: '在舰队总部的私人舱里醒来，你是这次远征的出资人兼继承人，舱门外站着两位舰长，都在等你先选谁。', situation: '近权力' },
      { id: 'stationmaster-cabin', name: '站长休息舱', hook: '在站长办公室的休息舱里醒来，站长是你的父亲，他昨夜失踪了，而他的权限今早自动转到了你名下。', situation: '近权力' },
      { id: 'bridge-watch', name: '舰桥值班室', hook: '在舰桥的值班室里醒来，你值的是最后一班夜，航线图上多出一条没人批准的航线，签名是你的。', situation: '任职' },
      { id: 'repair-shop', name: '底舱维修铺', hook: '在底舱维修铺的吊床上醒来，你是站上最便宜的维修工，可今早送来的这台机器，整个站只有你敢碰。', situation: '市井' },
      { id: 'airlock-shed', name: '废弃气闸窝棚', hook: '在废弃气闸旁的窝棚里醒来，你是站上没有配给名额的人，靠捡漏活着，可今早漏下来的，是一整箱军用口粮。', situation: '落魄' },
      { id: 'captain-house', name: '舰长旧宅', hook: '在一间舰长旧宅里醒来，你家三代都是领航员，到你父亲那一代被除了名，这间屋子是唯一没被收走的家产。', situation: '落魄' },
      { id: 'waste-cabin', name: '废土独居舱', hook: '在废土边缘的独居舱里醒来，你一个人住了九年，今早舱外多了一串脚印，停在门口，又原路回去了。', situation: '隐秘' },
      { id: 'visitor-ship', name: '外来飞船客舱', hook: '在一艘外来飞船的客舱里醒来，你是这条航线上唯一的乘客，船员们对你客气得过了头——像在等你身上的什么东西过期。', situation: '外来' },
      { id: 'exile-pod', name: '放逐舱发射位', hook: '在放逐舱的发射位上醒来，你是被全站投票放逐的人，发射窗在两小时后，可你的放逐令上，罪名一栏是空的。', situation: '危险' },
      { id: 'free-market', name: '自由市货柜', hook: '在自由市的货柜里醒来，你是跑这条航线的行商，货柜里压着全站都在找的净水滤芯，而你的进货单写的是别人的名字。', situation: '市井' },
      { id: 'merchant-ship', name: '商船船员舱', hook: '在过境商船的船员舱里醒来，船只停六小时，你的货必须在六小时里脱手——可站上的买家，刚刚全被隔离了。', situation: '市井' },
    ],
  },
]

/*
 * God mode: a world the reader writes themselves instead of picking a preset
 * stage. 'custom' is deliberately NOT part of GENRES (the preset wall and the
 * artwork set stay preset-only); it is registered in the id lookup so every
 * engine path — draft normalising, story creation, local scenes, merged
 * stories — resolves it with safe generic scaffolding, while the world's
 * actual name and rules come from the draft's customWorldName /
 * customWorldSetting fields.
 */
export const CUSTOM_GENRE_ID = 'custom'
export const CUSTOM_WORLD_NAME_MAX = 40
export const CUSTOM_WORLD_SETTING_MAX = 600
// A hand-typed book title caps at the same 30 characters as a hand-renamed
// chapter title (EDIT-BOOK §29 set that rule for titles a reader edits).
// Derived titles (the forge suggestion, a fused line's 合流：… name) are
// engine-composed and are NOT retroactively capped — the cap governs what
// a person may type, in the forge's 书名 field and in the settings book.
export const BOOK_TITLE_MAX = 30
export const START_POINT_NAME_MAX = 30
export const START_POINT_HOOK_MAX = 120
// The avatar （化身） a story was opened with: only the id and the one-line
// appearance travel in the config. The profile itself lives on the server
// under the reader's account; editing it never rewrites a book's copy.
export const AVATAR_ID_MAX = 64
export const AVATAR_APPEARANCE_MAX = 300
// The one-line effect of the ability this book was opened with (REQ-57):
// the ability NAME alone used to be all the config carried, so a picked
// power's effect — and above all a hand-written or avatar-signature
// power's effect — never reached the telling. The desc now rides beside
// the name for every path (library pick, custom, avatar signature) and
// the chapter brief states it next to the name. Books opened before
// this field existed simply have no desc; their brief is unchanged.
export const ABILITY_DESC_MAX = 120
// The protagonist persona text (typed, or composed from an imported
// character card): who this person is, in free words, riding the config
// into every generation brief.
export const PERSONA_MAX = 600
// The plaza publication a story was entered from, when it was opened by
// bringing the reader's own avatar into someone else's finished line.
// Bookkeeping only — like the avatar id, it never reaches the model.
export const SOURCE_PUBLICATION_ID_MAX = 80
export const CUSTOM_GENRE = {
  id: CUSTOM_GENRE_ID,
  label: '创世神',
  world: '未命名世界',
  title: '未命名世界',
  tagline: '世界由你亲手写',
  description: '没有现成的世界：名字、规则和氛围，都由你写下的设定说了算。',
  color: 'steel',
  symbol: '✎',
  location: '故事开始的地方',
}

/*
 * 身份 (origin identity): the concept layer above the spawn point. The reader
 * first picks WHO they are in this world — one of ten cross-world concepts —
 * and only then picks a concrete place to wake up in, from the short list
 * that belongs to that identity in that world. A bare place name is strange
 * before you know the world; an identity frames it ("皇帝的卧室" reads very
 * differently once you know you are 皇室嫡系).
 *
 * ORIGIN_SPAWN_TABLE is the landing table: per world, per identity, a local
 * title (what this world calls such a person) plus the ids of the spawn
 * points that belong to that identity there. Points live exactly once in
 * each genre's spawnPoints registry; cells reference them by id, so one
 * point can serve two identities （山神破庙 serves both hermit and mystery)
 * without its text ever being copied.
 */
export const ORIGIN_IDENTITIES = [
  { id: 'heir', name: '顶级势力核心', description: '生来就站在这世界的顶端，名字本身就是通行证——也是靶子。', situation: '近权力' },
  { id: 'official', name: '权力机构中人', description: '在维系世界的机构里当差，有身份、有权限，也有一本必须服从的规章。', situation: '任职' },
  { id: 'mystery', name: '身世成谜', description: '连你自己都说不清从哪儿来，过去是一团雾，偏偏总有人比你先知道答案。', situation: '隐秘' },
  { id: 'commoner', name: '草根平民', description: '没有靠山也没有光环，靠手艺和人情在这个世界里过日子。', situation: '市井' },
  { id: 'underclass', name: '底层边缘人', description: '住在世界的最底层，配给和体面都轮不到你先——但底层的规矩，你比谁都懂。', situation: '落魄' },
  { id: 'fallen', name: '没落门第', description: '家里曾经显赫过，如今只剩下旧宅、旧名声，和一堆没人肯认的旧账。', situation: '落魄' },
  { id: 'hermit', name: '隐世之人', description: '主动退出人群的人，在角落里过自己的日子，直到世界找上门来。', situation: '隐秘' },
  { id: 'outsider', name: '外来者', description: '昨天才踏进这个世界，它的规矩你一概不懂，它对你也一概好奇。', situation: '外来' },
  { id: 'exile', name: '流放者', description: '被原来的世界赶出来的人，带着一道没说清的罪名，在边缘重新开始。', situation: '危险' },
  { id: 'merchant', name: '行商旅人', description: '逐利而行，哪里有价差就去哪里；不属于任何地方，也因此哪里都去得了。', situation: '市井' },
]

const ORIGIN_IDENTITY_BY_ID = Object.fromEntries(ORIGIN_IDENTITIES.map((identity) => [identity.id, identity]))

export const originIdentityById = (id) => ORIGIN_IDENTITY_BY_ID[id] || null

const ORIGIN_SPAWN_TABLE = {
  mist: {
    heir: { title: '船王世家', points: ['shipowner-house', 'flagship-cabin'] },
    official: { title: '港务署当差', points: ['clocktower', 'pier'] },
    mystery: { title: '雾里来的人', points: ['lighthouse', 'inn-attic'] },
    commoner: { title: '港镇本地人', points: ['pier', 'fishmarket'] },
    underclass: { title: '渔排上的欠债人', points: ['raft', 'bridge-cave'] },
    fallen: { title: '没落船商之后', points: ['old-shipfirm', 'wreck'] },
    hermit: { title: '雾岛隐居者', points: ['lighthouse', 'reef-cave'] },
    outsider: { title: '搭客船来的外乡人', points: ['foreign-ship', 'wreck'] },
    exile: { title: '被放逐上岸的人', points: ['exile-ship', 'wreck'] },
    merchant: { title: '随船行商', points: ['warehouse-room', 'pier'] },
  },
  cultivation: {
    heir: { title: '宗门真传', points: ['scripture-attic', 'heir-dwelling'] },
    official: { title: '执法堂执事', points: ['law-hall', 'gate-post'] },
    mystery: { title: '碑上留名的人', points: ['temple', 'blank-stele'] },
    commoner: { title: '山脚村民', points: ['village', 'hillside-field'] },
    underclass: { title: '外门杂役', points: ['woodshed', 'hillside-field'] },
    fallen: { title: '没落支脉之后', points: ['branch-shrine', 'temple'] },
    hermit: { title: '后山隐修', points: ['temple', 'observatory'] },
    outsider: { title: '投宗的外乡人', points: ['tea-shed', 'village'] },
    exile: { title: '被逐下山的弟子', points: ['cliff-cell', 'woodshed'] },
    merchant: { title: '山下坊市的行商', points: ['market-shed', 'village'] },
  },
  neon: {
    heir: { title: '财团继承人', points: ['corp-penthouse', 'memory-vault'] },
    official: { title: '政府部门职员', points: ['bureau-night', 'audit-desk'] },
    mystery: { title: '没有档案的人', points: ['capsule', 'clinic'] },
    commoner: { title: '下城居民', points: ['recycle', 'night-market'] },
    underclass: { title: '贫民窟的拾荒者', points: ['slum', 'capsule'] },
    fallen: { title: '没落财团之后', points: ['old-flat', 'recycle'] },
    hermit: { title: '断网区的隐者', points: ['water-tower', 'capsule'] },
    outsider: { title: '从上城下来的人', points: ['repatriation-cabin', 'clinic'] },
    exile: { title: '被放逐到下城的人', points: ['exile-gate', 'clinic'] },
    merchant: { title: '黑市行商', points: ['black-market', 'recycle'] },
  },
  city: {
    heir: { title: '豪门继承人', points: ['old-house', 'chairman-office'] },
    official: { title: '街道办职员', points: ['street-office', 'govt-hall'] },
    mystery: { title: '查无此人的住户', points: ['netcafe', 'storage-room'] },
    commoner: { title: '长宁街的普通人', points: ['street-corner', 'convenience'] },
    underclass: { title: '街头讨生活的人', points: ['noodle-kitchen', 'park-bench'] },
    fallen: { title: '老字号的后人', points: ['old-shop', 'noodle-kitchen'] },
    hermit: { title: '天台上的隐居者', points: ['roof-tank', 'netcafe'] },
    outsider: { title: '初到长宁街的外乡人', points: ['coach-station', 'street-corner'] },
    exile: { title: '无处落户的人', points: ['evicted-room', 'park-bench'] },
    merchant: { title: '批发市场的行商', points: ['wholesale-stall', 'convenience'] },
  },
  court: {
    heir: { title: '皇室嫡系', points: ['emperor-room', 'side-palace'] },
    official: { title: '皇居当差', points: ['side-palace', 'inner-court'] },
    mystery: { title: '先帝旧档里的人', points: ['astro-tower', 'old-study'] },
    commoner: { title: '新入宫的小宫人', points: ['kitchen-yard', 'laundry'] },
    underclass: { title: '掖庭杂役', points: ['menial-room', 'cold-palace'] },
    fallen: { title: '获罪之家的后人', points: ['cold-palace', 'seized-house'] },
    hermit: { title: '退隐的老太医', points: ['herb-hut', 'astro-tower'] },
    outsider: { title: '外邦使节', points: ['envoy-lodge', 'opera-backstage'] },
    exile: { title: '被贬出京的人', points: ['exile-cart', 'cold-palace'] },
    merchant: { title: '宫市供货商', points: ['supply-office', 'kitchen-yard'] },
  },
  frontier: {
    heir: { title: '星际要员', points: ['hq-cabin', 'stationmaster-cabin'] },
    official: { title: '舰队军官', points: ['bridge-watch', 'obs-tower'] },
    mystery: { title: '从休眠舱醒来的人', points: ['cryo', 'obs-tower'] },
    commoner: { title: '配给名册上的站民', points: ['ration-cabin', 'repair-shop'] },
    underclass: { title: '没有配给名额的人', points: ['airlock-shed', 'ration-cabin'] },
    fallen: { title: '被除名舰长的后人', points: ['captain-house', 'ration-cabin'] },
    hermit: { title: '废土独居者', points: ['waste-cabin', 'obs-tower'] },
    outsider: { title: '过境飞船的乘客', points: ['visitor-ship', 'cargo'] },
    exile: { title: '被全站放逐的人', points: ['exile-pod', 'cargo'] },
    merchant: { title: '跑航线的行商', points: ['free-market', 'merchant-ship'] },
  },
}

const SPAWN_POINT_BY_ID = new Map(
  GENRES.map((genre) => [genre.id, new Map((genre.spawnPoints || []).map((point) => [point.id, point]))]),
)

// The landing cell for one identity in one world: the identity concept, the
// local title this world gives it, and its spawn points (the very objects
// from the world's registry — shared points stay shared, never copied).
export const originSpawnCell = (genre, identityId) => {
  const identity = originIdentityById(identityId)
  if (!identity || !genre) return null
  const cell = ORIGIN_SPAWN_TABLE[genre.id]?.[identity.id]
  if (!cell) return null
  const byId = SPAWN_POINT_BY_ID.get(genre.id)
  const points = (cell.points || []).map((pointId) => byId?.get(pointId)).filter(Boolean)
  return { identity, title: cell.title || identity.name, points }
}

export const spawnPointsForIdentity = (genre, identityId) => originSpawnCell(genre, identityId)?.points || []

// What this world calls a person of that identity. God-mode worlds have no
// table — the concept name itself is the title there.
export const localIdentityTitle = (genre, identityId) => {
  const identity = originIdentityById(identityId)
  if (!identity) return ''
  if (!genre || genre.id === CUSTOM_GENRE_ID) return identity.name
  return ORIGIN_SPAWN_TABLE[genre.id]?.[identity.id]?.title || identity.name
}

// The resolved origin for a config: concept + this world's local title.
// Returns null when no (valid) identity was picked — legacy stories and
// drafts keep behaving exactly as they did before identities existed.
export const originSummaryFor = (genre, config) => {
  const identity = originIdentityById(config?.originIdentityId)
  if (!identity) return null
  return {
    id: identity.id,
    name: identity.name,
    situation: identity.situation,
    localTitle: localIdentityTitle(genre, identity.id),
  }
}

const originPremisePhrase = (genre, config) => {
  const origin = originSummaryFor(genre, config)
  if (!origin) return ''
  return origin.localTitle !== origin.name
    ? `身为${origin.localTitle}（${origin.name}）的`
    : `身为${origin.name}的`
}

const originBeatLine = (genre, config) => {
  const origin = originSummaryFor(genre, config)
  if (!origin) return ''
  return origin.localTitle !== origin.name
    ? `出身：${origin.localTitle}（${origin.name}）`
    : `出身：${origin.name}`
}

/*
 * Ability candidates. There is no global ability menu any more: each
 * preset world owns a pool written in its own vocabulary, and each craft
 * template brings two signature abilities that travel with the category.
 * The start flow composes the list for the current (world × template)
 * pair — signatures first, then the world pool, de-duplicated by name.
 * A god-mode (custom) world has no pool of its own: it offers the pinned
 * template's signatures, or a small generic pool when nothing is pinned.
 * Custom text and a random roll from the composed list complete the step.
 */
export const WORLD_ABILITY_POOLS = {
  mist: [
    { id: 'tide', name: '听见潮汐', desc: '从水与回声里读取被隐藏的记忆' },
    { id: 'mist-fogpath', name: '雾里认路', desc: '雾再大也认得回港的航线，走失的人会先找到你' },
    { id: 'mist-salvage', name: '沉物打捞', desc: '能把沉进水底的东西，连同它的故事一起捞上来' },
    { id: 'mist-tidemark', name: '潮痕预读', desc: '从退潮留下的痕迹里，读出昨夜发生过什么' },
  ],
  cultivation: [
    { id: 'ember', name: '借火一瞬', desc: '让即将熄灭的事物再燃一次' },
    { id: 'cult-windsword', name: '御剑听风', desc: '剑未出鞘，先听见三丈内的风声与杀意' },
    { id: 'cult-lingxi', name: '灵息内视', desc: '闭上眼，能看见自己与旁人灵脉的走向' },
    { id: 'cult-shadowmark', name: '云阶留影', desc: '在走过的地方留下一道只有自己看得见的影子标记' },
  ],
  neon: [
    { id: 'echo', name: '读取备份', desc: '从残留的声音里找回被删除的真相' },
    { id: 'neon-ghost', name: '幽灵进程', desc: '在任何系统里留一个不被日志记录的分身' },
    { id: 'neon-sniff', name: '信号嗅探', desc: '隔着三堵墙，也能闻到未加密数据的味道' },
    { id: 'neon-blackout', name: '断电行走', desc: '全城断电时，你的义体照常运转' },
  ],
  city: [
    { id: 'city-ear', name: '街巷耳报', desc: '一条街的风吹草动，总比消息早一步到你耳朵里' },
    { id: 'city-ledger', name: '人情账本', desc: '谁欠过谁的人情，你过目不忘，也从不记错' },
    { id: 'city-oldshop', name: '老店直觉', desc: '走进任何一家老店，一眼看穿它真正的招牌' },
    { id: 'city-keepsake', name: '旧物认主', desc: '经你手的旧物会「开口」，说出上一任主人的一个习惯' },
  ],
  court: [
    { id: 'court-readface', name: '察言观色', desc: '一句话没说完，你已经听出对方真正想要什么' },
    { id: 'court-memory', name: '过目成诵', desc: '看过的诏令、名单与账册，一字不差刻在脑子里' },
    { id: 'court-ritual', name: '礼制破局', desc: '任何规矩到了你手里，都能找到一条合礼的活路' },
    { id: 'court-poison', name: '宴前知毒', desc: '杯盏未动，先知道哪一道菜不能碰' },
  ],
  frontier: [
    { id: 'thread', name: '缝合裂隙', desc: '把两个不相容的事物短暂地连在一起' },
    { id: 'front-deepspace', name: '深空听噪', desc: '从宇宙背景噪声里，分辨出人工信号的节律' },
    { id: 'front-revive', name: '废件复活', desc: '报废的设备在你手里，总能再撑一班岗' },
    { id: 'front-gravity', name: '重力微调', desc: '在一臂之内，让轻的东西再轻一点、重的东西再慢一点' },
  ],
}

export const TEMPLATE_SIGNATURE_ABILITIES = {
  xuanhuan: [
    { id: 'sig-xuanhuan-1', name: '气运加身', desc: '机缘总先一步落到你头上，绝境里也留着一线生机' },
    { id: 'sig-xuanhuan-2', name: '吞噬进化', desc: '吞下天材地宝与妖丹，直接化作自己的修为' },
  ],
  xianxia: [
    { id: 'sig-xianxia-1', name: '丹火不熄', desc: '你炼的火永不无故熄灭，废丹也能回收三成' },
    { id: 'sig-xianxia-2', name: '斩念', desc: '把一种执念暂时斩出体外，换片刻清明' },
  ],
  gaowu: [
    { id: 'sig-gaowu-1', name: '气血可视', desc: '一眼看穿对手的气血数值与最薄的那处破绽' },
    { id: 'sig-gaowu-2', name: '越战越勇', desc: '伤得越重，出手越重，榜单为你实时跳动' },
  ],
  'romance-ancient': [
    { id: 'sig-romance-ancient-1', name: '记账入心', desc: '府里每一笔人情与银钱往来，你都记得分毫不差' },
    { id: 'sig-romance-ancient-2', name: '察色知心', desc: '从一个人的眉眼之间，读出他藏得最深的那件事' },
  ],
  scifi: [
    { id: 'sig-scifi-1', name: '维度折叠', desc: '把一小段路程折起来，跨过去——只够一个人用' },
    { id: 'sig-scifi-2', name: '熵减之手', desc: '被你碰过的东西，损坏的速度会慢下来' },
  ],
  wuxianliu: [
    { id: 'sig-wuxianliu-1', name: '点数嗅觉', desc: '能闻出哪个任务的奖励，被主神低估了' },
    { id: 'sig-wuxianliu-2', name: '结算预知', desc: '结算之前，你先看见自己这一趟的评分' },
  ],
  'guize-guatan': [
    { id: 'sig-guize-guatan-1', name: '规则显形', desc: '看过的规则会在你眼里标出自相矛盾的那一条' },
    { id: 'sig-guize-guatan-2', name: '字缝求生', desc: '从规则的字缝里，找到没写出来的那个例外' },
  ],
  horror: [
    { id: 'sig-horror-1', name: '厉鬼标价', desc: '看任何一只鬼，你都能估出它值多少、怕什么' },
    { id: 'sig-horror-2', name: '鬼市通行', desc: '在人和鬼都摆摊的地方，能谈成一笔买卖' },
  ],
  lishi: [
    { id: 'sig-lishi-1', name: '大势预读', desc: '能看见一件事三年后的余波，先一步落子' },
    { id: 'sig-lishi-2', name: '名将旧梦', desc: '睡梦里能旁观一场打过的仗，醒来记得每个细节' },
  ],
  'romance-modern': [
    { id: 'sig-romance-modern-1', name: '情绪听诊', desc: '听一个人说话，能听出他没说出口的那层意思' },
    { id: 'sig-romance-modern-2', name: '体面收场', desc: '再难堪的场面，你都能留住双方的体面' },
  ],
  'suspense-supernatural': [
    { id: 'sig-suspense-supernatural-1', name: '阴阳半眼', desc: '能看见不该看见的东西，但只在天黑之后' },
    { id: 'sig-suspense-supernatural-2', name: '寒意定位', desc: '寒意最重的地方，就是真相藏得最深的地方' },
  ],
  campus: [
    { id: 'sig-campus-1', name: '错题回声', desc: '做错的题会在梦里重播，直到你彻底搞懂' },
    { id: 'sig-campus-2', name: '榜单在心', desc: '任何榜单看过一遍，名次与分数都刻在心里' },
  ],
  urban: [
    { id: 'sig-urban-1', name: '城市嗅觉', desc: '能闻出一桩生意里，钱和风险各占几成' },
    { id: 'sig-urban-2', name: '人脉活水', desc: '你帮过的人，总会在你需要时以意想不到的方式出现' },
  ],
  'zhihu-short': [
    { id: 'sig-zhihu-short-1', name: '反转直觉', desc: '一件事的走向，你总能提前一步猜到拐点' },
    { id: 'sig-zhihu-short-2', name: '一句翻盘', desc: '在最关键的场合，你总能说出扭转局势的那句话' },
  ],
  'er-ren': [
    { id: 'sig-er-ren-1', name: '恶名远播', desc: '你的名字先你三天到达下一座城，守门人听见就手抖' },
    { id: 'sig-er-ren-2', name: '掠夺直觉', desc: '一眼看穿一处地方最值钱、又最守不住的东西是什么' },
  ],
}

export const GENERIC_ABILITY_POOL = [
  { id: 'gen-verse', name: '言出法随', desc: '说出口的小事，总会以某种方式成真' },
  { id: 'gen-halfbeat', name: '时间慢半拍', desc: '危险临头的那一瞬，你比别人多半秒' },
  { id: 'gen-mindglimpse', name: '读心余光', desc: '与人对视时，能瞥见对方没说出口的半句话' },
  { id: 'gen-luck', name: '逢凶化吉', desc: '坏事落到你身上时，总差最后临门一脚' },
]

export const ALL_ABILITIES = [
  ...Object.values(WORLD_ABILITY_POOLS).flat(),
  ...Object.values(TEMPLATE_SIGNATURE_ABILITIES).flat(),
  ...GENERIC_ABILITY_POOL,
]

// The composed candidate list for the ability step. Preset worlds: the
// pinned template's signatures first, then the world's own pool (a template
// that is not pinned contributes nothing). Custom worlds: signatures of
// the pinned craft, or the generic pool when completely free.
export const abilityCandidatesFor = ({ genreId, genreTemplateId, custom = false } = {}) => {
  const signatures = TEMPLATE_SIGNATURE_ABILITIES[genreTemplateId] || []
  if (custom) return signatures.length ? [...signatures] : [...GENERIC_ABILITY_POOL]
  const pool = WORLD_ABILITY_POOLS[genreId] || []
  const seen = new Set()
  return [...signatures, ...pool].filter((item) => {
    if (seen.has(item.name)) return false
    seen.add(item.name)
    return true
  })
}

// The same candidates, grouped for display: the forge's ability section
// renders one titled group per origin so the reader can see which pool a
// power comes from (template signatures vs the world's own pool; the
// god-mode generic pool is its own group). Order and de-duplication match
// abilityCandidatesFor exactly.
export const abilityGroupsFor = ({ genreId, genreTemplateId, custom = false } = {}) => {
  const signatures = TEMPLATE_SIGNATURE_ABILITIES[genreTemplateId] || []
  if (custom) {
    return signatures.length
      ? [{ kind: 'signature', items: [...signatures] }]
      : [{ kind: 'generic', items: [...GENERIC_ABILITY_POOL] }]
  }
  const pool = WORLD_ABILITY_POOLS[genreId] || []
  const seen = new Set(signatures.map((item) => item.name))
  const worldItems = pool.filter((item) => !seen.has(item.name))
  const groups = []
  if (signatures.length) groups.push({ kind: 'signature', items: [...signatures] })
  if (worldItems.length) groups.push({ kind: 'world', items: worldItems })
  return groups
}

/*
 * Story types are the fifteen knowledge-base templates (knowledge/
 * genres.json). The ids here must stay identical to that file — a test locks
 * them together. A template is a pure category: it governs ONLY the writing
 * craft (reader promise, pleasures, beats) via genreTemplateId. It is NOT
 * bound to any world — the world comes solely from the reader's own stage
 * pick (config.genreId, or a god-mode custom world), and any template can be
 * told in any world. `symbol`/`color` are the brick's own decoration, never
 * a world's artwork. Symbols follow one system: a single bold character
 * taken from the template's own name (∞ is the lone glyph exception — it IS
 * the infinite-flow mark), rendered at one size and weight on every brick,
 * so no brick's mark can wash out against its tinted gradient the way the
 * old abstract glyphs did.
 */
export const GENRE_TEMPLATES = [
  { id: 'xuanhuan', name: '玄幻', fullName: '玄幻', blurb: '一路打上去，揭开世界的真相', symbol: '玄', color: '#38bdf8' },
  { id: 'xianxia', name: '修仙', fullName: '修仙', blurb: '改命登天，代价先行', symbol: '仙', color: '#fbbf24' },
  { id: 'gaowu', name: '高武', fullName: '高武', blurb: '气血与排名全城可见，从榜尾打进榜单', symbol: '武', color: '#fb923c' },
  { id: 'romance-ancient', name: '古言', fullName: '言情 · 古言', blurb: '宫斗、宅斗与礼法之下的步步为营', symbol: '古', color: '#fb7185' },
  { id: 'scifi', name: '科幻', fullName: '科幻 · 星际/末世', blurb: '从最底层活起，逐层升维', symbol: '科', color: '#34d399' },
  { id: 'wuxianliu', name: '无限流', fullName: '无限流', blurb: '副本里生死真价，结算时点数到账', symbol: '∞', color: '#22d3ee' },
  { id: 'guize-guatan', name: '规则怪谈', fullName: '规则怪谈', blurb: '规则条条要命，靠读字走出活路', symbol: '规', color: '#f472b6' },
  { id: 'horror', name: '恐怖', fullName: '恐怖', blurb: '把厉鬼算成资产，在复苏前结账', symbol: '烛', color: '#94a3b8' },
  { id: 'lishi', name: '历史', fullName: '历史', blurb: '低位入局，用事功改掉已知的败局', symbol: '史', color: '#eab308' },
  { id: 'romance-modern', name: '现言', fullName: '言情 · 现言', blurb: '成年人的重逢、心动与迟到的真话', symbol: '现', color: '#f0a6ff' },
  { id: 'suspense-supernatural', name: '灵异悬疑', fullName: '灵异悬疑', blurb: '每查一步，寒意就具体一分', symbol: '灵', color: '#818cf8' },
  { id: 'campus', name: '校园', fullName: '校园', blurb: '一张成绩榜，管着整个青春', symbol: '铃', color: '#4ade80' },
  { id: 'urban', name: '都市', fullName: '都市', blurb: '小人物在城市规则里翻盘', symbol: '都', color: '#a78bfa' },
  { id: 'zhihu-short', name: '知乎短篇', fullName: '知乎风短篇', blurb: '第一人称，三分钟一个反转', symbol: '知', color: '#facc15' },
  { id: 'er-ren', name: '恶人', fullName: '恶人', blurb: '这一回，你来当那个恶人', symbol: '恶', color: '#f87171' },
]

const GENRE_TEMPLATE_BY_ID = Object.fromEntries(GENRE_TEMPLATES.map((template) => [template.id, template]))

export const genreTemplateById = (id) => GENRE_TEMPLATE_BY_ID[id] || null

/*
 * 题材两级分类 (two-level taxonomy): the start flow's first screen is a set
 * of L1 "shelves" (families a reader browses by), each holding L2 writing
 * templates. The engine only ever pins the L2 template id — a shelf is pure
 * navigation, so picking through a shelf changes no generation semantics
 * and existing stories need no migration (their template id maps back to
 * its shelf by lookup). Most shelves group by genre family; 短篇 groups by
 * form and 反派主角 by protagonist archetype — a bookshop's mixed-axis
 * shelving, named as-is. Single-member shelves tap straight through to
 * their only template in the UI.
 */
export const GENRE_SHELVES = [
  { id: 'xuanzhen', name: '玄幻修真', templateIds: ['xuanhuan', 'xianxia', 'gaowu'] },
  { id: 'yanqing', name: '言情', templateIds: ['romance-ancient', 'romance-modern'] },
  { id: 'dushi', name: '都市现实', templateIds: ['urban', 'campus'] },
  { id: 'lishi', name: '历史', templateIds: ['lishi'] },
  { id: 'kehuan', name: '科幻', templateIds: ['scifi'] },
  { id: 'xuanyi', name: '悬疑惊悚', templateIds: ['horror', 'guize-guatan', 'suspense-supernatural'] },
  { id: 'fuben', name: '副本竞技', templateIds: ['wuxianliu'] },
  { id: 'duanpian', name: '短篇', templateIds: ['zhihu-short'] },
  { id: 'fanpai', name: '反派主角', templateIds: ['er-ren'] },
]

export const shelfForTemplate = (templateId) =>
  GENRE_SHELVES.find((shelf) => shelf.templateIds.includes(templateId)) || null

export const shelfById = (shelfId) => GENRE_SHELVES.find((shelf) => shelf.id === shelfId) || null

export const DEFAULT_DRAFT = {
  genreId: 'mist',
  genreTemplateId: '',
  // UI-only flow marker: true once the user has actually picked (or rolled)
  // a world on the world screen. The engine ignores it; the start flow uses
  // it to tell a deliberate world apart from the default and to recognise
  // pre-world-screen drafts, which carry no marker at all.
  worldChosen: false,
  storyLengthMode: 'short',
  // 篇幅自由化 fields: the reader-chosen chapter total for 'custom' mode
  // (10–999; null elsewhere — 'endless' has no target by definition) and the
  // manual-finish timestamp for an 'endless' line ('' while it still runs).
  targetChapters: null,
  finishedAt: '',
  seasonNumber: 1,
  originIdentityId: '',
  customWorldName: '',
  customWorldSetting: '',
  // 书名 (TITLE-FLOW): the book's own title, chosen by its creator. Empty
  // means "not chosen" — createStory then falls back to the derived
  // suggestion (titleFor). The world keeps its own name either way: the
  // title and the world are separate facts from this batch on.
  bookTitle: '',
  // Imported world material （外部导入）: lorebook entries attached to the
  // story (SillyTavern world-info / split text worlds). Owner-private —
  // stripped from every public snapshot. Empty for every pre-import save.
  lorebook: [],
  // 文风预设 (generation control): one of STYLE_PRESETS' ids. Owner detail —
  // it steers only the generation instructions, so snapshots strip it back
  // to 'default' like the other private stock.
  stylePreset: 'default',
  startPointName: '',
  startPointHook: '',
  avatarId: '',
  avatarAppearance: '',
  sourcePublicationId: '',
  name: '',
  // Free-text persona (typed in the forge, or composed from an imported
  // character card's description/personality/scenario).
  persona: '',
  trait: '冷静观察者',
  // No preset origin or ability: the origin comes only from the identity
  // step (resolved per world at read time), and the ability only from the
  // ability step's (world × template) candidate list. A pre-identity-step
  // story may still carry its own stored origin text; that stays readable.
  origin: '',
  ability: '',
  tone: '诗性冒险',
  immersive: false,
  hometown: '',
  school: '',
  company: '',
  role: '',
  friend: '',
  destination: '',
  step: 1,
}

/*
 * 篇幅 (story length): a story's total chapter count is derived from its
 * length mode, never written as a bare 6 anywhere in the engine.
 * - 'short'  6 chapters — the original single-volume shape; also the shape of
 *   every pre-mode save (a missing storyLengthMode means 'short') and of
 *   merged stories whose fusion chose no length: the combination table
 *   defaults finished × finished to 'short' and any combination touching
 *   a still-serialising line to 'endless' (FUSION2). Since 2026-10-30 a
 *   fusion may instead pin the reader's explicit choice — short / season /
 *   long / endless — exactly like an ordinary forge.
 * - 'season' 24 chapters = 4 acts × 6; acts end in a small upgrade point and
 *   chapter 24 closes the season with the big one, after which the reader
 *   may open the next season (seasonNumber + 1, stakes raised).
 * - 'long'   100 chapters = 4 arcs × 25; arc ends are the big nodes and the
 *   outline compresses to 20 macro entries instead of one per chapter.
 * - 'custom' a reader-chosen total (CUSTOM_LENGTH_MIN–MAX chapters): the
 *   season's structure generalised — 4 acts scaled proportionally to the
 *   total, small upgrade points at the three interior act boundaries and
 *   the big finale upgrade on the last chapter.
 * - 'endless' no total at all: rolling mini-arcs of ENDLESS_ARC_CHAPTERS
 *   chapters, a small upgrade point closing each arc, never a finale node
 *   and never auto-complete. The line ends only when its owner finishes it
 *   by hand (config.finishedAt), which freezes the total at the chapter
 *   count reached. While it runs it is already publishable to the plaza as
 *   a living, still-serialising publication.
 * Turning beats repeat on the same six-chapter rhythm in every mode:
 * position 1 of each six-block is a first-type turning point, position 3 a
 * second-type one.  Before the intervention batch these positions carried
 * the chapter-end choices and gated pre-generation on them; the rhythm
 * itself is structural and stays (the beat plan leans on it), but nothing
 * is gated on a reader decision any more — chapters flow straight on.
 */
export const CUSTOM_LENGTH_MIN = 10
export const CUSTOM_LENGTH_MAX = 999
export const ENDLESS_ARC_CHAPTERS = 12

export const STORY_LENGTH_MODES = {
  short: { id: 'short', total: 6, label: '短季', unitLabel: '卷', unitSize: 6 },
  season: { id: 'season', total: 24, label: '一季', unitLabel: '幕', unitSize: 6 },
  long: { id: 'long', total: 100, label: '长线', unitLabel: '弧', unitSize: 25 },
  custom: { id: 'custom', total: null, label: '自定义', unitLabel: '幕', unitSize: null },
  endless: { id: 'endless', total: null, label: '无限连载', unitLabel: '弧', unitSize: ENDLESS_ARC_CHAPTERS },
}

// A custom total is only meaningful as an integer inside the sanctioned
// range; anything else is not a custom length at all.
export const validTargetChapters = (value) =>
  Number.isInteger(value) && value >= CUSTOM_LENGTH_MIN && value <= CUSTOM_LENGTH_MAX ? value : null

const configOf = (source) =>
  source && typeof source === 'object'
    ? (source.config && typeof source.config === 'object' ? source.config : source)
    : {}

export const storyLengthModeOf = (source) => {
  if (!source || typeof source !== 'object') return 'short'
  // A fused line's mode is whatever createMergedStory pinned on its
  // config: the reader's explicit length choice when one was made
  // (short / season / long / endless — owner ruling 2026-10-30), or
  // the combination table's product otherwise (finished × finished →
  // short; any serialising source → endless). Legacy fused saves pin
  // 'short' or 'endless' the same way; anything unrecognised falls
  // back to 'short', the fused line's historical shape.
  const mode = configOf(source)?.storyLengthMode
  return STORY_LENGTH_MODES[mode] ? mode : 'short'
}

// An endless line its owner has finished by hand: the finish timestamp is
// the only "ended" signal an unbounded line ever gets.
export const isManuallyFinished = (source) =>
  storyLengthModeOf(source) === 'endless' && Boolean(configOf(source)?.finishedAt)

// The resolved length facts for a source. `total` is Infinity for a running
// endless line (every `index < total` check then simply passes), and the
// reached chapter count once the line has been finished by hand. A custom
// mode without a valid stored target falls back to the season total —
// normalizeDraft refuses to create such a config, so the fallback only
// ever covers hand-built fixtures.
const lengthSpecFor = (source) => {
  const mode = storyLengthModeOf(source)
  const config = configOf(source)
  if (mode === 'custom') {
    return { mode, total: validTargetChapters(config.targetChapters) ?? 24, unitCount: 4, unitLabel: '幕', endless: false }
  }
  if (mode === 'endless') {
    const finished = isManuallyFinished(source)
    const reached = Array.isArray(source?.chapters) ? source.chapters.length : 0
    return {
      mode,
      total: finished && reached > 0 ? reached : Infinity,
      unitCount: null,
      unitLabel: '弧',
      endless: true,
      finished,
    }
  }
  const spec = STORY_LENGTH_MODES[mode]
  return { mode, total: spec.total, unitCount: spec.total / spec.unitSize, unitLabel: spec.unitLabel, endless: false }
}

export const totalChaptersFor = (source) => lengthSpecFor(source).total

export const isStoryComplete = (story) =>
  Boolean(story) && Array.isArray(story.chapters) && story.chapters.length >= totalChaptersFor(story)

// Finish an endless line by hand: the total freezes at the chapters the
// line actually reached, the status flips to complete, and the line
// becomes publishable as a finished line. Any other mode is returned
// untouched (finite lines finish themselves).
export const finishEndlessLine = (story) => {
  if (!story || typeof story !== 'object' || storyLengthModeOf(story) !== 'endless') return story
  if (isManuallyFinished(story)) return story
  const timestamp = now()
  return {
    ...story,
    status: 'complete',
    updatedAt: timestamp,
    config: { ...story.config, finishedAt: timestamp },
  }
}

// The world bible outline is one entry per chapter, except where that
// would drown the prompt: totals above 24 compress to 20 macro entries,
// and an endless line outlines two rolling arcs ahead (24 entries) rather
// than pretending to know an ending.
export const outlineLengthFor = (source) => {
  const spec = lengthSpecFor(source)
  if (spec.endless) return ENDLESS_ARC_CHAPTERS * 2
  return spec.total > 24 ? 20 : spec.total
}

export const outlineIndexFor = (index, source) => {
  const spec = lengthSpecFor(source)
  const length = outlineLengthFor(source)
  if (spec.endless) return ((index % length) + length) % length
  return Math.max(0, Math.min(length - 1, Math.floor(index * length / spec.total)))
}

export const decisionTypeAt = (index) =>
  index % 6 === 1 ? 'first' : index % 6 === 3 ? 'second' : null

// Where a chapter sits in its length structure: which act/arc, which of the
// six beat positions it plays, and whether it is an upgrade point. Finite
// modes share one generalised shape — `unitCount` equal acts spanning the
// total, boundaries at the proportional quarter points (for 6/24/100 these
// reproduce the historical unit boundaries exactly) — while a running
// endless line rolls fixed-size arcs with no finale, ever.
export const structureFor = (source, index) => {
  const spec = lengthSpecFor(source)
  const { mode, total } = spec
  // An endless line's history is arcs all the way down — even after a
  // manual finish, no chapter retroactively becomes a "finale": the line
  // was stopped, not concluded. (Completeness is isStoryComplete's job.)
  if (spec.endless) {
    const unitSize = ENDLESS_ARC_CHAPTERS
    const unitIndex = Math.floor(index / unitSize)
    const positionInUnit = index - unitIndex * unitSize
    const beatPosition = Math.min(5, Math.floor(positionInUnit * 6 / unitSize))
    const isUnitEnd = positionInUnit === unitSize - 1
    return {
      mode,
      total,
      unitSize,
      unitCount: null,
      unitIndex,
      unitLabel: spec.unitLabel,
      positionInUnit,
      beatPosition,
      isUnitEnd,
      isFinale: false,
      isUpgradePoint: isUnitEnd,
      upgradeKind: isUnitEnd ? '小升格' : null,
    }
  }
  const unitCount = spec.unitCount
  const unitIndex = Math.min(unitCount - 1, Math.floor(index * unitCount / total))
  const unitStart = Math.ceil(unitIndex * total / unitCount)
  const unitEnd = Math.ceil((unitIndex + 1) * total / unitCount) - 1
  const positionInUnit = index - unitStart
  const unitSpan = unitEnd - unitStart + 1
  const beatPosition = Math.min(5, Math.floor(positionInUnit * 6 / unitSpan))
  const isUnitEnd = index === unitEnd
  const isFinale = index === total - 1
  return {
    mode,
    total,
    unitSize: unitSpan,
    unitCount,
    unitIndex,
    unitLabel: spec.unitLabel,
    positionInUnit,
    beatPosition,
    isUnitEnd,
    isFinale,
    isUpgradePoint: isUnitEnd,
    upgradeKind: isFinale
      ? (mode === 'season' ? '季终大升格' : mode === 'long' ? '长线终局结算' : mode === 'custom' ? '终章大升格' : '本卷收束')
      : isUnitEnd
        ? (mode === 'long' ? '弧末大节点' : '小升格')
        : null,
  }
}

let idCounter = 0

const GENRE_BY_ID = { ...Object.fromEntries(GENRES.map((genre) => [genre.id, genre])), [CUSTOM_GENRE_ID]: CUSTOM_GENRE }

const cleanText = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback
  return value.trim().slice(0, 240)
}

const cleanBounded = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''

// The name a story's world is actually called. Preset stages use their fixed
// name; a god-mode world uses the creator's own name (or the placeholder).
const worldNameOf = (genre, config) => genre.id === CUSTOM_GENRE_ID
  ? cleanBounded(config?.customWorldName, CUSTOM_WORLD_NAME_MAX) || CUSTOM_GENRE.world
  : genre.world

const customSettingOf = (config) => cleanBounded(config?.customWorldSetting, CUSTOM_WORLD_SETTING_MAX)

/*
 * 出生点 (spawn point): the small, concrete place where chapter one opens.
 * Each preset world carries a registry; the entry whose name equals the
 * world's `location` is the default, so saves written before spawn points
 * existed (no startPointName) resolve to exactly the place they always
 * opened at. When the draft picked an 身份 (origin identity), resolution
 * narrows to that identity's landing cell in the world (see
 * ORIGIN_SPAWN_TABLE) — the identity is the concept, the spawn point is the
 * concrete place it lands you in.
 * God-mode worlds have no list: the creator may type a free-form spawn point
 * (name, optionally with a hook borrowed from a bound template's world), and
 * an empty name means "the setting text decides" — resolveStartPoint then
 * returns null and every consumer falls back to its previous behaviour.
 */
export const startPointsFor = (genre) => (Array.isArray(genre?.spawnPoints) ? genre.spawnPoints : [])

export const defaultStartPoint = (genre) =>
  startPointsFor(genre).find((point) => point.name === genre.location) || startPointsFor(genre)[0] || null

export const startPointByName = (genre, name) => {
  const wanted = cleanBounded(name, START_POINT_NAME_MAX)
  if (!wanted) return null
  return startPointsFor(genre).find((point) => point.name === wanted) || null
}

export const resolveStartPoint = (genre, config = {}) => {
  if (!genre) return null
  const named = cleanBounded(config?.startPointName, START_POINT_NAME_MAX)
  const typedHook = cleanBounded(config?.startPointHook, START_POINT_HOOK_MAX)
  if (genre.id === CUSTOM_GENRE_ID) {
    return named ? { name: named, hook: typedHook, situation: '' } : null
  }
  // With an identity picked, the resolution domain narrows to that identity's
  // landing cell in this world: a name inside the cell uses its table entry,
  // anything else falls back to the cell's default (its first point). A
  // config without an identity resolves against the whole world table, as
  // every pre-identity save always has.
  const cell = originSpawnCell(genre, config?.originIdentityId)
  if (cell && cell.points.length) {
    const listed = cell.points.find((point) => point.name === named)
    return { ...(listed || cell.points[0]) }
  }
  const listed = startPointByName(genre, named)
  if (listed) return { ...listed }
  if (named) return { name: named, hook: typedHook, situation: '' }
  const fallback = defaultStartPoint(genre)
  return fallback ? { ...fallback } : null
}

const asStep = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.min(7, Math.floor(number))) : 1
}

const clone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

const now = () => new Date().toISOString()

const makeId = (prefix = 'story') => {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

export const genreFor = (genreId) => GENRE_BY_ID[genreId] || GENRE_BY_ID.mist

const normalizeDraft = (draft = {}) => {
  const input = draft && typeof draft === 'object' ? draft : {}
  const genreId = GENRE_BY_ID[input.genreId] ? input.genreId : DEFAULT_DRAFT.genreId
  const immersive = Boolean(input.immersive)
  // 篇幅自由化 validation: a 'custom' length without a valid in-range
  // target is rejected back to the season default rather than stored as a
  // broken config, and an 'endless' line never carries a target at all.
  const requestedMode = STORY_LENGTH_MODES[input.storyLengthMode] ? input.storyLengthMode : 'short'
  const targetChapters = validTargetChapters(input.targetChapters)
  const storyLengthMode = requestedMode === 'custom' && targetChapters === null ? 'season' : requestedMode
  // The UI may retain these optional details in its draft after the switch is
  // turned off. A newly created story must not inherit them without opt-in.
  const lifeDetail = (field) => immersive ? cleanText(input[field], DEFAULT_DRAFT[field]) : ''
  return {
    genreId,
    genreTemplateId: genreTemplateById(input.genreTemplateId)?.id || '',
    storyLengthMode,
    targetChapters: storyLengthMode === 'custom' ? targetChapters : null,
    finishedAt: cleanBounded(input.finishedAt, 40),
    seasonNumber: Number.isInteger(input.seasonNumber) && input.seasonNumber >= 1 && input.seasonNumber <= 99
      ? input.seasonNumber
      : 1,
    // Only the identity concept id is stored; the local title and the spawn
    // points are always resolved from the landing table, never persisted.
    originIdentityId: originIdentityById(input.originIdentityId)?.id || '',
    customWorldName: cleanBounded(input.customWorldName, CUSTOM_WORLD_NAME_MAX),
    customWorldSetting: cleanBounded(input.customWorldSetting, CUSTOM_WORLD_SETTING_MAX),
    bookTitle: cleanBounded(input.bookTitle, BOOK_TITLE_MAX),
    lorebook: normalizeLorebookEntries(input.lorebook),
    stylePreset: stylePresetById(input.stylePreset)?.id || 'default',
    startPointName: cleanBounded(input.startPointName, START_POINT_NAME_MAX),
    startPointHook: cleanBounded(input.startPointHook, START_POINT_HOOK_MAX),
    // The avatar this book was opened with (empty for every pre-avatar
    // save): the id ties the book to the reader's journeys list, and the
    // appearance line is the copy generation paints the protagonist from.
    avatarId: cleanBounded(input.avatarId, AVATAR_ID_MAX),
    avatarAppearance: cleanBounded(input.avatarAppearance, AVATAR_APPEARANCE_MAX),
    sourcePublicationId: cleanBounded(input.sourcePublicationId, SOURCE_PUBLICATION_ID_MAX),
    name: cleanText(input.name, DEFAULT_DRAFT.name),
    persona: cleanBounded(input.persona, PERSONA_MAX),
    trait: cleanText(input.trait, DEFAULT_DRAFT.trait),
    origin: cleanText(input.origin, DEFAULT_DRAFT.origin),
    ability: cleanText(input.ability, DEFAULT_DRAFT.ability),
    abilityDesc: cleanBounded(input.abilityDesc, ABILITY_DESC_MAX),
    tone: cleanText(input.tone, DEFAULT_DRAFT.tone),
    immersive,
    hometown: lifeDetail('hometown'),
    school: lifeDetail('school'),
    company: lifeDetail('company'),
    role: lifeDetail('role'),
    friend: lifeDetail('friend'),
    destination: lifeDetail('destination'),
    step: asStep(input.step),
  }
}

const protagonistName = (config, fallback = '未命名旅人') => cleanText(config?.name, '') || fallback

const displayIdentity = (config, genre) => {
  const role = cleanText(config?.role, '')
  if (role) return role
  // The origin is resolved from the identity step now, in this world's own
  // words; a pre-identity-step story keeps displaying its stored origin
  // text, and only a story with neither falls back to the nameless label.
  const summary = originSummaryFor(genre || genreFor(config?.genreId), config)
  if (summary) return summary.localTitle
  return cleanText(config?.origin, '') || '无名旅人'
}

const realityDetail = (config) => {
  if (!config?.immersive) return ''
  const hometown = cleanText(config.hometown, '')
  const school = cleanText(config.school, '')
  const company = cleanText(config.company, '')
  const role = cleanText(config.role, '')
  return [
    hometown && `来自${hometown}`,
    school && `曾在${school}学习`,
    company && `在${company}工作`,
    role && `以${role}为生`,
  ].filter(Boolean).join('、')
}

const titleFor = (config, genre) => {
  const name = protagonistName(config, '')
  if (genre.id === CUSTOM_GENRE_ID) {
    const world = worldNameOf(genre, config)
    return name ? `${world} · ${name}` : world
  }
  if (name) return `${genre.title} · ${name}`
  return genre.title
}

/**
 * The suggested book title for a draft (TITLE-FLOW): exactly what
 * createStory will name the book when the creator never typed a title of
 * their own. The forge shows it as the 书名 field's suggestion so the
 * reader can see — before the book exists — what it will be called, and
 * that the name is theirs to change.
 */
export function bookTitleSuggestionFor(draft = {}) {
  const config = normalizeDraft(draft)
  return titleFor(config, genreFor(config.genreId))
}

const OUTLINE_STAGE_SUFFIXES = ['', '——局势推进，代价初显', '——对手加压，旧线索翻面', '——筹码重组，立场见分晓']

const outlineFor = (genre, config) => {
  const name = protagonistName(config)
  const identity = displayIdentity(config, genre)
  const destination = cleanText(config.destination, '') || genre.location
  const spawn = resolveStartPoint(genre, config)
  const mode = storyLengthModeOf({ config })
  const total = totalChaptersFor({ config })
  // An endless line has no total to outline: two rolling arcs (24 entries),
  // and its closing beat is an arc-close, never a finale — the line is
  // written to continue. Finite totals above 24 compress to 20 entries.
  const endless = mode === 'endless'
  const length = endless ? ENDLESS_ARC_CHAPTERS * 2 : total > 24 ? 20 : total
  const unitCount = endless ? 2 : total === 100 ? 4 : total === 6 ? 1 : 4
  const unitLabel = endless || total === 100 ? '弧' : '幕'
  const arcClose = genre.id === CUSTOM_GENRE_ID
    ? `这一弧的账在${worldNameOf(genre, config)}结清，${name}望向更深的地方——下一弧的门已经开了一条缝。`
    : `这一弧的账在${genre.world}结清，${name}望向更深的地方——下一弧的门已经开了一条缝。`
  const beats = genre.id === CUSTOM_GENRE_ID
    ? [
      spawn
        ? `${name}以${identity}的身份在${spawn.name}醒来，创世设定落地的第一幕开始。`
        : `${name}以${identity}的身份踏入${worldNameOf(genre, config)}，创世设定落地的第一幕开始。`,
      `设定里的第一条规则开始运转，${name}被卷入其中，无人能置身事外。`,
      `一次选择让同行者与${name}站到同一条路上，也留下新的代价。`,
      `旧秩序要求${name}交出能力，真正的对手从设定深处显形。`,
      `${name}必须在回到原点与改写规则之间作出最后准备。`,
      endless ? arcClose : `终局会回答：这个由创世者亲手写下的世界，最终会变成什么样子。`,
    ]
    : [
      `${name}以${identity}的身份在${spawn?.name || genre.location}醒来，收到一个无法解释的信号。`,
      `信号把${name}带向${destination}，第一条世界规则开始松动。`,
      `一次选择让同行者与${name}站到同一条路上，也留下新的代价。`,
      `旧秩序要求${name}交出能力，真正的敌人从记忆里显形。`,
      `${name}必须在回到原点与打开边界之间作出最后准备。`,
      endless ? arcClose : `终局会回答：谁有权替这个世界记住未来。`,
    ]
  const seen = new Array(6).fill(0)
  return Array.from({ length }, (_, entry) => {
    const beat = Math.min(5, Math.floor(entry * 6 / length))
    const unit = Math.min(unitCount - 1, Math.floor(entry * unitCount / length))
    const occurrence = seen[beat]
    seen[beat] += 1
    const unitStarts = entry > 0 && Math.floor(entry * unitCount / length) > Math.floor((entry - 1) * unitCount / length)
    const lead = unitCount > 1 && unit > 0 && unitStarts ? `第${unit + 1}${unitLabel}——` : ''
    const suffix = occurrence > 0 ? OUTLINE_STAGE_SUFFIXES[Math.min(occurrence, OUTLINE_STAGE_SUFFIXES.length - 1)] : ''
    return `${lead}${beats[beat]}${suffix}`
  })
}

export const worldBibleFor = (genre, config) => {
  const name = protagonistName(config)
  const detail = realityDetail(config)
  const seasonNumber = Number.isInteger(config?.seasonNumber) && config.seasonNumber > 1 ? config.seasonNumber : 1
  const seasonRules = seasonNumber > 1
    ? [`第${seasonNumber}季升格：标尺整体抬高一格——对手的层级、筹码的价码与主角要守的东西都比上一季更重；上一季的结局是这一季的起点，不是重播。`]
    : []
  if (genre.id === CUSTOM_GENRE_ID) {
    const world = worldNameOf(genre, config)
    const setting = customSettingOf(config)
    const spawn = resolveStartPoint(genre, config)
    const opening = spawn ? `故事从${spawn.name}开始` : '这个世界还没有成文的设定，规则将随故事逐一显形'
    return {
      premise: setting
        ? `${seasonNumber > 1 ? `第${seasonNumber}季——` : ''}${world}：${setting} ${originPremisePhrase(genre, config)}${name}${detail ? `（${detail}）` : ''}的故事，就从这个由创世者亲手写下的世界里开始${spawn ? `，第一幕落在${spawn.name}` : ''}。`
        : `${world}里，${originPremisePhrase(genre, config)}${name}${detail ? `（${detail}）` : ''}的故事从这里开始；${opening}。`,
      rules: [
        ...(setting
          ? [`创世设定（这个世界以此为准）：${setting}`]
          : ['这个世界尚无成文规则，第一章将随主角的行动立下第一条。']),
        '已经发生的事会留下可追踪的回声，不能被无痕抹去。',
        '能力有边界；每一次越界都会改变关系或世界稳定度。',
        ...seasonRules,
      ],
      endingAnchor: storyLengthModeOf({ config }) === 'endless'
        ? `${name}的路没有预设的终点：每十二章结清一弧的账，再向更深的地方走一弧，直到讲述者亲手停笔。`
        : `${name}必须决定${world}的未来走向，以及谁有资格改写它的规则。`,
      outline: outlineFor(genre, config),
    }
  }
  const spawn = resolveStartPoint(genre, config)
  return {
    premise: `${seasonNumber > 1 ? `第${seasonNumber}季——` : ''}${genre.world}里，${originPremisePhrase(genre, config)}${name}${detail ? `（${detail}）` : ''}在${spawn?.name || genre.location}发现一条会被无名外力搅动的世界线。`,
    rules: [
      `${genre.world}的秘密只能通过具体行动被唤醒。`,
      '已经发生的事会留下可追踪的回声，不能被无痕抹去。',
      '能力有边界；每一次越界都会改变关系或世界稳定度。',
      ...seasonRules,
    ],
    endingAnchor: storyLengthModeOf({ config }) === 'endless'
      ? `${name}的路没有预设的终点：每十二章结清一弧的账，再向更深的地方走一弧，直到讲述者亲手停笔。`
      : `${name}必须决定把记忆交给谁，以及是否让世界继续保持原样。`,
    outline: outlineFor(genre, config),
  }
}

const validateStory = (story) => {
  if (!story || typeof story !== 'object' || typeof story.id !== 'string') {
    throw new TypeError('story must be a Story object')
  }
  if (!Array.isArray(story.chapters) || !story.config || typeof story.config !== 'object') {
    throw new TypeError('story is missing chapters or config')
  }
}

const validateIndex = (index, story) => {
  const total = story ? totalChaptersFor(story) : 6
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    throw new RangeError(`chapter index must be an integer from 0 to ${total - 1}`)
  }
}

const hash = (value) => {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}

/*
 * The retired choice tables, kept ONLY as legacy knowledge: they validate
 * a choice recorded before retirement (snapshots, the read-time repair of
 * legacy decision scenes) and nothing else.  No generation path reads
 * them — `buildChapter` mints `choice: null` for every chapter, in every
 * mode, from now on.
 */
const legacyChoiceAt = (story, index) => {
  const type = decisionTypeAt(index)
  if (!type) return null
  const config = story.config || {}
  const genre = genreFor(story.genreId || config.genreId)
  const merged = story.kind === 'merged'
  const act = Math.floor(index / 6)
  if (type === 'first') {
    if (merged) {
      const bond = config.merge?.bond === 'rivals' ? '先试探对方' : '先把后背交给对方'
      return {
        prompt: `${bond}，你要怎样回应合流信号？`,
        options: [
          { id: 'join', label: '并肩走进合流点', detail: '让两种规则先共享一口气息', consequence: '双主角关系获得共同目标。' },
          { id: 'guard', label: '保持距离观察', detail: '先确认对方没有带来污染', consequence: '世界稳定度上升，但信任会变慢。' },
        ],
      }
    }
    const noun = genre.id === 'cultivation' ? '火种' : genre.id === 'neon' ? '备份' : genre.id === 'city' ? '留言' : '信'
    if (act > 0) {
      return {
        prompt: `第 ${act + 1} 幕的${noun}再次送到${protagonistName(config)}手边，这一次它带着上一幕的回声，也带着更高的价码。要现在回应吗？`,
        options: [
          { id: 'open', label: '立刻回应', detail: '让这一次的来客知道你已经听见', consequence: '线索变清晰，关系更靠近。' },
          { id: 'wait', label: '先按下不动', detail: '记下信号，去找一个更安全的出口', consequence: '稳定度上升，但真相会绕远。' },
        ],
      }
    }
    return {
      prompt: `${protagonistName(config)}收到一枚${noun}，要现在回应吗？`,
      options: [
        { id: 'open', label: '立刻回应', detail: '让未知的来客知道你已经听见', consequence: '线索变清晰，关系更靠近。' },
        { id: 'wait', label: '先按下不动', detail: '记下信号，去找一个更安全的出口', consequence: '稳定度上升，但真相会绕远。' },
      ],
    }
  }
  if (merged) {
    return {
      prompt: '两套规则同时发出警报，谁来决定下一步？',
      options: [
        { id: 'bridge', label: '让规则互相翻译', detail: '接受短暂的不稳定，找一条共同语法', consequence: '两个世界获得新的共同规则。' },
        { id: 'separate', label: '保留各自边界', detail: '不牺牲任何一方的原有秩序', consequence: '合流变慢，但两条世界线保持清醒。' },
      ],
    }
  }
  if (act > 0) {
    return {
      prompt: `${worldNameOf(genre, config)}把新的代价推到${protagonistName(config)}面前——这一幕押上的，比上一幕更重。`,
      options: [
        { id: 'cross', label: `前往${cleanText(config.destination, '') || genre.location}`, detail: `用“${cleanText(config.ability, '') || '你的能力'}”穿过边界`, consequence: '主动承担风险，打开隐藏章节。' },
        { id: 'return', label: '回到熟悉的地方', detail: `向${cleanText(config.friend, '') || '一个可信的人'}求证`, consequence: '保留退路，也让旧关系重新发声。' },
      ],
    }
  }
  return {
    prompt: `${worldNameOf(genre, config)}要求你为下一段路选定代价。`,
    options: [
      { id: 'cross', label: `前往${cleanText(config.destination, '') || genre.location}`, detail: `用“${cleanText(config.ability, '') || '你的能力'}”穿过边界`, consequence: '主动承担风险，打开隐藏章节。' },
      { id: 'return', label: '回到熟悉的地方', detail: `向${cleanText(config.friend, '') || '一个可信的人'}求证`, consequence: '保留退路，也让旧关系重新发声。' },
    ],
  }
}

// Local storage is user-editable, so a stale or hand-written choice must not
// be treated as a real recorded branch even in legacy views.  This validates
// a PRE-RETIREMENT recording against the legacy tables; it is used only by
// snapshots and the legacy prose repair — generation never consults it, so
// a stored choice can no longer steer or gate any new chapter.
const validChoiceAt = (story, index) => {
  const candidate = story?.choices?.[index]
  if (typeof candidate !== 'string') return null
  const choice = legacyChoiceAt(story, index)
  return choice?.options?.some((option) => option.id === candidate) ? candidate : null
}

// Interventions that have already landed strictly before `index`: the echo
// source for later chapters in every length mode (what decisions used to
// feed before they retired). Only applied entries count — a queued nudge
// has not touched the world yet.
const priorInterventions = (story, index) =>
  interventionsOf(story)
    .filter((entry) => entry.status === 'applied' && entry.targetIndex < index)
    .sort((a, b) => a.targetIndex - b.targetIndex)

/*
 * Chapters past the first six (season acts 2–4, long-line arcs) cannot replay
 * the base scene table — the reader would meet the same scene three more
 * times. Instead each world carries four act motifs, and the six beat
 * positions are re-skinned per act: same dramatic skeleton, new surface,
 * earlier interventions echoed rather than replayed. The tests lock this:
 * scenes at chapters 7/13/25 differ from each other and from every base
 * scene.
 */
const ACT_MOTIFS = {
  mist: ['雾季更替', '外港来船', '钟声改点', '退潮见底'],
  cultivation: ['灵脉回潮', '宗门大比', '秘境开门', '天榜重排'],
  neon: ['雨季换挡', '全城断电夜', '备份拍卖周', '上城来人'],
  city: ['梅雨时节', '老街改造', '夜班换乘', '凌晨市集'],
  court: ['宫宴时节', '新人入宫', '边关急报', '太后寿宴'],
  frontier: ['补给船季', '辐射风暴', '星图校准', '议会换届'],
  custom: ['旧设定松动', '新规则试行', '边界之外', '世界回声'],
}

const variationSceneFor = (story, genre, index, ctx) => {
  const structure = structureFor(story, index)
  const motifs = ACT_MOTIFS[genre.id] || ACT_MOTIFS.custom
  const motif = motifs[structure.unitIndex % motifs.length]
  const unitWord = structure.mode === 'long' ? '弧' : '幕'
  const landed = priorInterventions(story, index)
  const echo = landed.length
    ? `那股无名的力量在第 ${landed[landed.length - 1].targetIndex + 1} 章留下的痕迹，这一${unitWord}还在发烫。`
    : null
  const { name, ability, friend, destination, world } = ctx
  const positions = [
    [`${world}进入${motif}的时节，空气先一步变了味道。`, `${name}在${destination}重新站稳脚跟——上一${unitWord}的账还没算完，新的局势已经压到眼前。`, `这一${unitWord}里，“${ability}”的回声比从前更响，也更贵。`],
    [`新的信号在${motif}里送到${name}手边，比上一${unitWord}更急，也更不容拒绝。`, '信号停在掌心，封口下有一点微光，安静地等着一个回答。', `留给${name}的时间，只剩下一次呼吸。`],
    [...(echo ? [echo] : []), `${name}循着新线索抵达${destination}的另一侧，那里和上一${unitWord}隔着一整套新规矩。`, `${friend}带来一条上一${unitWord}没人敢说的消息：局势的价码，已经重标过了。`],
    [`${motif}把旧秩序推到${name}面前，价码比上一${unitWord}抬高一格。`, '两条路都摆在面前，一条回头，一条向前；没有人先替TA开口。', '真正的对手还没有露面，只先送来了一句写在价目表上的话。'],
    [`${name}把这一${unitWord}攒下的筹码一次押上，局势当场翻面。`, `${destination}方向传来回应——比预想的更快，也更近。`],
    [`${motif}落幕，这一${unitWord}的账当场结清：名次、代价与新到手的筹码，一样不少。`, `${name}站稳了新的一格，${world}的标尺为TA重新标了一次价。`, `下一${unitWord}的门已经开了一条缝，缝里透出的光，和这一${unitWord}的结尾完全不同。`],
  ]
  return positions[structure.beatPosition]
}

/*
 * A fused line that inherited endless mode outgrows the six base merge
 * scenes: past them, arcs roll on the lead world's motifs with the same
 * six-position skeleton as a solo line's variation scenes, re-skinned for
 * two protagonists — the pair's joint ledger, never a solo hero's.
 */
const mergedVariationSceneFor = (story, index, { first, second, lead, bond }) => {
  const structure = structureFor(story, index)
  const genre = genreFor(story.genreId || story.config?.genreId)
  const motifs = ACT_MOTIFS[genre.id] || ACT_MOTIFS.custom
  const motif = motifs[structure.unitIndex % motifs.length]
  const other = lead === first ? second : first
  const positions = [
    [`合流点在${motif}里重新亮起，两种规则的光交叠成新的颜色。`, `${lead}先一步踏进去，${other}紧随其后——上一弧的账还没算完，新的局势已经压到眼前。`, `这一弧里，两个人共同见证的每一次扰动，都要比上一弧更贵。`],
    [`新的信号同时抵达${first}与${second}手边，比上一弧更急，也更不容拒绝。`, '信号停在两个人中间，安静地等着一个共同的回答。', `${bond}的两个人，第一次为同一件事皱眉。`],
    [`${first}与${second}把两条原线各带来的一条未解线索，在合流点拼成一张完整的图。`, `图的全貌刚刚显形，缺口处就先亮出了对手的名字。`],
    [`${motif}把两套规则的冲突推到台前，价码比上一弧抬高一格。`, '翻译还是分离，两个人必须当场选一边站。', '真正的对手还没有露面，只先送来了一句写在价目表上的话。'],
    [`${first}与${second}把这一弧攒下的筹码一次押上，局势当场翻面。`, `合流点深处传来回应——比预想的更快，也更近。`],
    [`${motif}落幕，这一弧的账当场结清：标尺、代价与新到手的筹码，一样不少。`, `${first}与${second}站稳了新的一格，下一弧的门已经开了一条缝，缝里的光和这一弧的结尾完全不同。`],
  ]
  return positions[structure.beatPosition]
}

const sceneFor = (story, index) => {
  const config = story.config || {}
  const genre = genreFor(story.genreId || config.genreId)
  const name = protagonistName(config)
  const identity = displayIdentity(config, genre)
  const ability = cleanText(config.ability, '') || '尚未命名的能力'
  const trait = cleanText(config.trait, '') || '还没有被定义的性格'
  const summary = originSummaryFor(genre, config)
  const origin = cleanText(config.origin, '') || summary?.name || '无名来处'
  const identityWithOrigin = identity === origin ? identity : `${identity}（${origin}）`
  const friend = cleanText(config.friend, '') || '一个尚未现身的同行者'
  const destination = cleanText(config.destination, '') || genre.location
  const lived = realityDetail(config)

  if (story.kind === 'merged') {
    const protagonists = Array.isArray(config.protagonists) ? config.protagonists : []
    const first = protagonistName(protagonists[0], '旅者甲')
    const second = protagonistName(protagonists[1], '旅者乙')
    const bond = config.merge?.bond === 'rivals' ? '彼此提防' : '暂时结盟'
    const lead = config.merge?.lead === 'b' ? second : first
    const mergedScenes = [
      [`${first}与${second}的世界在${genre.location}相撞。`, `${lead}先听见另一条世界线的回声；${bond}的两个人，必须在同一秒抬头。`],
      [`合流信号逼近，${first}和${second}面对同一扇没有门的门。`, '门内的光停在两个人脚边，既没有催促，也没有替他们迈出第一步。', `他们各自的能力都被要求说出真实名字。`],
      [`共同的天空短暂地恢复颜色。`, `${first}和${second}把两种记忆叠在一起，发现敌人来自规则之外。`],
      [`两套世界规则同时发出警报。`, '两种声音争相占据天空，尚未有人决定让它们靠近，还是各自退回边界。', `${first}把选择权递给${second}，而${second}没有立即回答。`],
      [`合流点开始坍缩，所有未说出口的话变成可见的路标。`, `他们决定把最重要的秘密留给彼此，而不是留给任何一条旧世界线。`],
      [`新的宇宙终于找到共同的呼吸。`, `${first}与${second}站在同一片晨光里：边界没有消失，只是终于学会了相遇。`],
    ]
    if (index < mergedScenes.length) return mergedScenes[index]
    return mergedVariationSceneFor(story, index, { first, second, lead, bond })
  }

  if (index >= 6) {
    return variationSceneFor(story, genre, index, {
      name,
      ability,
      friend,
      destination,
      world: worldNameOf(genre, config),
    })
  }

  const livedLine = lived ? `那一点来自真实生活的火种——${lived}——让这次触碰显得异常熟悉。` : `没有人替${name}解释眼前的异常，只有${trait}让TA没有立刻转身。`
  const customWorld = worldNameOf(genre, config)
  const customSetting = customSettingOf(config)
  const customSettingLine = customSetting
    ? `创世者为这个世界写下的设定是：「${customSetting}」`
    : '这个世界还没有成文的设定，第一页将由主角的脚步写下。'
  const scenes = {
    mist: [
      [`${genre.world}的潮汐钟在${genre.location}敲响第七次。`, `${name}作为${identityWithOrigin}站在雾海边，手里握着“${ability}”的微弱回声。`, livedLine],
      [`雾里漂来一封没有落款的信，${name}听见潮水叫出自己的名字。`, '信纸仍然合拢，封口下有一点蓝火，安静地等着一个回答。', '钟声催着潮水倒退，留给TA的时间只剩下一次呼吸。'],
      [`${name}沿着倒流的潮痕抵达${destination}。`, `一位陌生的守钟人说，只有真正记得自己的人才能穿过雾门。`, `TA想起${friend}曾经说过的一句话：不要把每个答案都交给钟声。`],
      [`钟塔内部没有楼梯，只有一面把记忆折成房间的墙。`, '门缝里透出陌生的光，身后的旧坐标仍然清晰；两条路都在等待。', `真正的敌人不是潮水，而是被人删掉的那一段历史。`],
      [`风暴把港镇推向同一条轨道，${name}必须决定要保护哪一种记忆。`, `TA把身份、能力与一路收集的回声放在同一架天平上。`, `${destination}的灯亮了三次，像是在等待一个不再犹豫的回答。`],
      [`潮汐终于落下，露出一座从未出现在地图上的岛。`, `${name}没有替世界写死结局；TA只留下一个可以被后来者继续选择的名字。`, `沉潮港记住了这次选择，下一条世界线由此开始。`],
    ],
    cultivation: [
      [`${genre.world}的灵脉在${genre.location}裂开一道细缝。`, `${name}这个${identityWithOrigin}被召到山门前，掌心藏着“${ability}”最后一簇火。`, livedLine],
      [`天门落下一枚无主的火印，${name}必须决定要不要接住。`, '火印悬在掌心上方，温度还没有穿透皮肤，旧符也仍在袖中。', `山风把路吹向${destination}，也吹来仙门不愿承认的真相。`],
      [`${name}在${destination}遇见一座倒悬的藏经塔。`, `塔中没有经文，只有${friend}留下的三句批注，字迹仍带着未熄的温度。`, `修行不是把自己变得无坚不摧，而是知道哪一处裂缝必须被保护。`],
      [`灵火开始吞噬旧法阵，所有长老都要求${name}交出“${ability}”。`, '旧山门与燃烧的法阵各占据一侧，谁也没有得到TA最后的答复。', `天上第一次传来没有人说过的第三种声音。`],
      [`天门向下开启，凡人与仙门的名字同时被写进天榜。`, `${name}在飞升前回望${genre.location}，发现真正的火种从来不属于某一个宗门。`, `选择留下的代价，比选择登天更需要勇气。`],
      [`火种没有熄灭，它只是从一双手传到了更多双手。`, `${name}让自己的名字成为一道可以被质疑的注脚，而不是新的戒律。`, `青岚宗的夜空里，第一颗不属于仙人的星星亮了。`],
    ],
    neon: [
      [`${genre.world}的雨水把${genre.location}刷成深蓝。`, `${name}作为${identityWithOrigin}接入一份名为“${ability}”的异常人格备份。`, livedLine],
      [`备份在${name}耳边说出一句只有TA自己知道的话。`, '读取心跳的请求停在视野中央，确认键与断开键同时闪烁。', `追踪信号指向${destination}，那里的雨没有落地。`],
      [`${name}穿过${destination}的蓝雨，遇见${friend}的匿名头像。`, `对方说记忆不是证据，选择才是；然后把一把不存在的钥匙推过来。`, `钥匙打开的不是门，而是一个仍在运行的童年。`],
      [`城市主机要求${name}删除“${ability}”以恢复秩序。`, '两份冲突的人格等待最后授权，安全屋的地址依然留在离线地图里。', '整座城市的屏幕停在同一秒，等一个尚未落下的指令。'],
      [`系统倒计时归零，${name}站在没有摄像头的十字路口。`, `TA发现真正需要被备份的不是记忆，而是每个人仍能改变的权利。`, `${destination}传来一段无主的旋律，像在邀请城市醒来。`],
      [`雨停了三十秒，足够一座城重新命名自己。`, `${name}没有删除那份人格，只给它留下了可以说“不”的边界。`, `蓝雨再次落下时，故事已经不再属于某一个数据库。`],
    ],
    city: [
      [`${genre.world}的时钟永远停在凌晨四点。`, `${name}作为${identityWithOrigin}在${genre.location}醒来，口袋里有一张写着“${ability}”的车票。`, livedLine],
      [`车票背面出现一条只在夜里发光的留言。`, '一班没有终点的电车停在站台前，车门敞着，还没有人上车。', `站牌上的${destination}忽明忽暗，像一段没有发出的邀请。`],
      [`${name}在${destination}遇见${friend}，对方说自己已经等了很多年。`, `他们交换了一段不完整的记忆，发现整座城市都在替某个人保守秘密。`, `凌晨四点不是终点，而是所有错过的人短暂重逢的入口。`],
      [`城市广播要求${name}放弃“${ability}”换取一条回家的路。`, '熟悉的街角就在身后，前方熄灭的路灯则等着另一种答案。', '广播重复了最后一个问题，城市还没有等到回答。'],
      [`天快亮了，${name}必须决定哪一段夜晚值得被留下。`, `TA把选择写进${genre.location}的公共墙面，允许下一个路人改写最后一行。`, `${destination}的门没有关，像是在给未来预留座位。`],
      [`凌晨四点终于过去，城市没有忘记那些没能赶上的人。`, `${name}带着一张空白车票走向晨光，知道重逢不是结局而是新的选择。`, `长宁街第一次拥有了属于所有人的早晨。`],
    ],
    court: [
      [`${genre.world}的册封礼刚过三日，宫里的钟比往日慢了半拍。`, `${name}这个${identityWithOrigin}第一次走进${genre.location}，掌事姑姑把一册写着“${ability}”的旧档推到TA面前，只说了一句：看完就烧。`, livedLine],
      [`旧档里夹着一封没有寄出的家书，字迹在半途换了人。`, '家书压在妆奁最底层，封口完好，收信人的名字却被人用朱砂划去。', `姑姑说，${destination}那边的席位已经空了三年，只等一个人坐回去。`],
      [`${name}在${destination}见到${friend}，对方只问了一句：你想赢，还是想活？`, `两个人隔着一扇屏风谈了一夜，把各自知道的半张棋盘拼到了一起。`, `位分是给外人看的，真正的命数藏在谁先沉不住气里。`],
      [`旧档的来历被翻了出来，太后与陛下同时召见${name}。`, '两道旨意摆在案上，一道给恩宠，一道给出路；殿里的香还没燃尽。', `所有人都看着${name}的手会先伸向哪一道。`],
      [`王朝的账算到了最后一页，${name}发现最初的那封家书，原是写给自己的。`, `TA把选择权交还给被划去名字的那个人，而不是替TA原谅谁。`, `${destination}的灯次第亮起，像一条终于能走完的路。`],
      [`朱墙依旧，天光落进来时却不再刺眼。`, `${name}没有赢得所有，只赢回了说“不”的资格——这比位分更难，也更长久。`, `宫墙深处，从此多了一盏为后来者留的灯。`],
    ],
    frontier: [
      [`${genre.location}的引力锚第三次失稳，整座${genre.world}的灯都暗了一瞬。`, `${name}这个${identityWithOrigin}攥着最后一张配给卡，听见广播把“${ability}”列为未登记变量。`, livedLine],
      [`废弃货舱里传出一串重复的求救码，落款是三十年前失踪的殖民船。`, '求救码停在最后一位，没有解完，也没有消失，像一句没说完的话。', `导航把航线标向${destination}——那片星域在所有官方图上都是空白。`],
      [`${name}在${destination}遇见${friend}的应急人格备份，对方说自己等这一班船等了三十年。`, `备份交出一张手绘星图：官方版本删掉的航线，全在上面。`, `在边疆，活下去的第一课是承认旧地图是错的。`],
      [`星环议会要求${name}交出“${ability}”的登记权，换全船队的燃料配额。`, '配给表已经发到每个人手里，倒计时挂在舱门上方；没有人先开口。', `真正的敌人不在废土里，在那张永远算不平的账上。`],
      [`废土的信号塔全部转向同一片空白星域，${name}必须决定舰队是启程还是留下。`, `TA把启程的决定交给投票，而不是交给配给表。`, `${destination}的方向升起一颗不在任何图上的星。`],
      [`星环以远，第一艘自愿启程的船点火成功。`, `${name}没有成为新的领航神话，只在航行日志第一页写下：规则可以重学，人不能重来。`, `边疆从此有了自己的第一页历史。`],
    ],
    custom: [
      [`${customWorld}在${name}睁开眼时显形——它不属于任何一张现成的地图。`, `${name}作为${identityWithOrigin}站在故事开始的地方，手里握着“${ability}”的第一缕回声。`, customSettingLine],
      [`这个世界的第一条规则在${name}面前运转起来，比设定里写的更不讲道理。`, '一件小事被规则放大，四周安静下来，像在等TA先迈出一步。', `而${friend}——如果这个世界里真有这个人——应该已经听说了这件事。`],
      [`${name}循着回声往前走，发现设定里没写到的东西，比写到的更多。`, `一位同行者说，这个世界只对亲手写下它的人留了一扇后门。`],
      [`旧秩序找上了${name}，要求TA交出“${ability}”，理由写在设定之外的空白处。`, '两条路都摆在面前，一条回头，一条改写；没有人先替TA开口。', `真正的对手还没有露面，只先送来了一句话。`],
      [`${customWorld}开始偏离最初的设定，${name}必须决定：修正它，还是让它长成自己的样子。`, `TA把身份、能力与一路收集的回声放在同一架天平上。`],
      [`世界走到了设定没有覆盖的地方。`, `${name}没有替它写死结局；TA只留下一个可以被后来者继续改写的名字。`, `${customWorld}从这里开始，拥有了自己的第二页。`],
    ],
  }
  // Chapter one opens AT the spawn point: its hook replaces the generic
  // establishing line, and later lines in the opening scene that still name
  // the world's default location are re-pointed at the chosen spawn point.
  // Later chapters are untouched — a spawn point is a start, not a cage.
  if (index === 0) {
    const spawn = resolveStartPoint(genre, config)
    if (spawn && genre.id === CUSTOM_GENRE_ID) {
      scenes.custom[0] = [
        `${customWorld}在${name}睁开眼时显形——它不属于任何一张现成的地图。`,
        spawn.hook
          ? `${spawn.hook} ${name}这个${identityWithOrigin}的手里，握着“${ability}”的第一缕回声。`
          : `${name}作为${identityWithOrigin}在${spawn.name}醒来，手里握着“${ability}”的第一缕回声。`,
        customSettingLine,
      ]
    } else if (spawn) {
      const opening = scenes[genre.id][0]
      scenes[genre.id][0] = [
        spawn.hook || opening[0],
        ...opening.slice(1).map((line) => (spawn.name === genre.location ? line : line.split(genre.location).join(spawn.name))),
      ]
    }
  }
  return scenes[genre.id]?.[index] || scenes.mist[index]
}

export function createStory(draft = DEFAULT_DRAFT) {
  const config = normalizeDraft(draft)
  const genre = genreFor(config.genreId)
  const timestamp = now()
  return {
    id: makeId(),
    // The creator's own title wins; the derived suggestion is only the
    // fallback for a book whose creator never named it (TITLE-FLOW).
    title: config.bookTitle || titleFor(config, genre),
    genreId: genre.id,
    // The server resolves the genre template from this top-level field first;
    // it is only present when the draft pinned one explicitly.
    ...(config.genreTemplateId ? { genreTemplateId: config.genreTemplateId } : {}),
    config,
    worldBible: worldBibleFor(genre, config),
    chapterIndex: 0,
    chapters: [],
    choices: {},
    revision: 0,
    kind: 'solo',
    sourceIds: [],
    author: '我',
    createdAt: timestamp,
    updatedAt: timestamp,
    bookmarked: false,
  }
}

const CHAPTER_POSITION_TITLES = ['启程', '信号', '追迹', '越界', '回望', '新页']

export function buildChapter(story, index) {
  validateStory(story)
  validateIndex(index, story)
  const genre = genreFor(story.genreId || story.config.genreId)
  const scene = sceneFor(story, index)
  const structure = structureFor(story, index)
  const titleBase = genre.id === CUSTOM_GENRE_ID ? worldNameOf(genre, story.config) : genre.title
  const titles = story.kind === 'merged'
    ? ['相撞的天空', '合流信号', '共同的回声', '两种规则', '无昼之境', '共同呼吸']
    : [`${titleBase} · 初声`, `${titleBase} · 信号`, `${titleBase} · 追迹`, `${titleBase} · 越界`, `${titleBase} · 回望`, `${titleBase} · 新页`]
  const title = index < titles.length
    ? titles[index]
    : `${titleBase} · 第${index + 1}章 · ${CHAPTER_POSITION_TITLES[structure.beatPosition]}`
  const name = story.kind === 'merged'
    ? (story.config.protagonists || []).map((item, itemIndex) => protagonistName(item, `旅者${itemIndex === 0 ? '甲' : '乙'}`)).join('与')
    : protagonistName(story.config)
  const paragraphs = [...scene]
  // 介入落地： interventions aimed at this chapter are woven in as an
  // external-force event — a paragraph right after the opening that no
  // character can explain, an event on the ledger, and the marker the
  // reader shows at the chapter head. The model path receives the same
  // entries through its brief and stamps the same marker via this skeleton.
  const landedHere = interventionsForChapter(story, index)
  if (landedHere.length) {
    const nudges = landedHere.map((entry) => entry.text.replace(/[。；;]+$/, '')).join('；')
    paragraphs.splice(1, 0, `就在这时，一件不合常理的小事发生了：${nudges}。没有人能说清它从何而来，${name}只觉得风向在这一刻变了——像有一股无名的力量，刚刚伸手拨动过这个世界。`)
  }
  const spawn = story.kind === 'merged' ? null : resolveStartPoint(genre, story.config)
  const summary = structure.isFinale
    ? `${name}抵达终局，世界为新的选择留出位置。`
    : index === 0 && spawn
      ? `${name}在${spawn.name}醒来，故事的第一幕从这里开始。`
      : index < 6
        ? `${name}在${worldNameOf(genre, story.config)}推进到第${index + 1}幕。`
        : `${name}在${worldNameOf(genre, story.config)}推进到第${index + 1}章。`
  // 章节台账 (deterministic local extraction; the model path supplies its
  // own): the chapter's headline event, one event per intervention that
  // landed here, and a structure event at upgrade points. Foreshadowing
  // points at the next outline entry that is still unresolved.
  const events = [summary]
  for (const entry of landedHere) {
    events.push(`介入事件：“${entry.text}”——无名外力搅动世界线，已在本章落地`)
  }
  if (structure.isUpgradePoint) {
    events.push(`结构节点：${structure.upgradeKind}——本${structure.unitLabel}的标尺与代价在此结算`)
  }
  const foreshadowing = []
  if (!structure.isFinale) {
    const outline = Array.isArray(story.worldBible?.outline) ? story.worldBible.outline : []
    const nextOutline = outline[outlineIndexFor(index + 1, story)]
    if (nextOutline) foreshadowing.push(`未解：${nextOutline}`)
  }
  return {
    id: `${story.id}:chapter:${index}:r${story.revision}`,
    index,
    title,
    paragraphs,
    // Choices are retired: every chapter, at every position, carries none.
    choice: null,
    summary,
    events,
    foreshadowing,
    ...(landedHere.length
      ? { interventions: landedHere.map((entry) => ({ text: entry.text, kind: entry.kind })) }
      : {}),
  }
}

// The story's event/foreshadowing ledger up to a chapter: every accepted
// chapter's structured events, and the foreshadowing still on the books.
// Server generation injects a compact slice of this into later chapters;
// the reader shows it as a read-only list.
export function storyLedgerFor(story, maxChapterIndex = Number.POSITIVE_INFINITY) {
  validateStory(story)
  const events = []
  const foreshadowing = []
  for (const chapter of Array.isArray(story.chapters) ? story.chapters : []) {
    if (!chapter || !Number.isInteger(chapter.index) || chapter.index > maxChapterIndex) continue
    for (const text of Array.isArray(chapter.events) ? chapter.events : []) {
      if (typeof text === 'string' && text) events.push({ chapter: chapter.index + 1, text })
    }
    for (const text of Array.isArray(chapter.foreshadowing) ? chapter.foreshadowing : []) {
      if (typeof text === 'string' && text) foreshadowing.push({ chapter: chapter.index + 1, text })
    }
  }
  return { events, foreshadowing }
}

/*
 * 介入 (intervention): the reader's steering hand after choices retired.
 * From inside the reader, the owner injects one nudge — free text, a preset
 * chip, or a roll of fate — and the world treats it as an external,
 * mysterious force stirring the worldline.  The rules are hard:
 *
 * - An intervention targets exactly ONE chapter: the next UNREAD chapter
 *   (the reader's current position + 1).  Current and past chapters are
 *   immutable — no engine path rewrites them; `retractChapter` /
 *   `replaceChapter` refuse any index at or behind the reading position.
 * - If that chapter does not exist yet, the intervention waits in the
 *   story's queue (`status: 'queued'`) and folds into its generation brief.
 *   If it already exists (pre-generated), the client runs a revision pass
 *   that regenerates the same slot with the intervention woven in.
 * - Several interventions queued for the same chapter combine into that
 *   one pass.  Accepting (or replacing) the chapter flips its entries to
 *   `status: 'applied'`; the chapter itself carries the marker — the entry
 *   texts — so the owner can see which chapter fate touched, and the
 *   ledger records the event for every later chapter.
 * - The queue is part of the story record: it validates, persists, and
 *   syncs through the cloud library like everything else, and the chapter
 *   key mixes the queue in, so a queued intervention invalidates any
 *   pre-generated copy of its target chapter.
 */
export const INTERVENTION_TEXT_MAX = 120

export const INTERVENTION_CHIPS = [
  { id: 'fortune', label: '机缘将至', text: '一桩意想不到的机缘正向主角靠近，近得几乎能伸手碰到' },
  { id: 'crisis', label: '危机逼近', text: '一场危机正从暗处向主角逼近，而主角对此一无所知' },
  { id: 'return', label: '故人将至', text: '一位故人即将出现在主角面前，带着只有他们才知道的旧事' },
  { id: 'omen', label: '天象异变', text: '天象毫无征兆地变了，异兆笼罩这个世界，人心跟着浮动' },
  { id: 'fate', label: '听天命', text: '' },
]

// The pool 听天命 draws from: generic nudges of fate, small enough to bend
// any world without breaking it. The pick is a hash of story id + queue
// length, so the client, the server and a later sync all resolve the same
// text for the same roll — the roll is fate, but it is the same fate
// everywhere.
const INTERVENTION_FATE_POOL = [
  '一阵无名的风改变了一件小事的走向，而没有人察觉',
  '一个陌生人即将出现，带着能改变局势的消息',
  '一件被所有人忽略的旧物，即将被重新看见',
  '天气毫无征兆地变了，连带着人心也变了',
  '主角错过的一件小事，将以意想不到的方式回到眼前',
  '某个远方的人做了一个决定，余波正向主角这边传来',
]

export const interventionChipById = (id) => INTERVENTION_CHIPS.find((chip) => chip.id === id) || null

const interventionsOf = (story) => (Array.isArray(story?.interventions) ? story.interventions : [])
  .filter((entry) => entry && Number.isInteger(entry.targetIndex) && typeof entry.text === 'string')

export const interventionsForChapter = (story, index) =>
  interventionsOf(story).filter((entry) => entry.targetIndex === index)

export const queuedInterventionsFor = (story, index) =>
  interventionsForChapter(story, index).filter((entry) => entry.status !== 'applied')

// The one chapter an intervention may touch: the next unread one. A
// finished line (finite total reached, or an endless line its owner has
// finished by hand) has no next chapter and returns null — the reader
// explains instead of queueing into the void.
export const interventionTargetIndex = (story, readerIndex) => {
  if (!story || typeof story !== 'object') return null
  const position = Number.isInteger(readerIndex) ? readerIndex : Number.isInteger(story.readerIndex) ? story.readerIndex : 0
  const target = position + 1
  // totalChaptersFor stays infinite for an endless line even after its
  // owner finishes it by hand; for targeting, a finished line's total is
  // the chapters it actually reached.
  const total = isManuallyFinished(story) ? (story.chapters?.length || 0) : totalChaptersFor(story)
  if (Number.isFinite(total) && target >= total) return null
  // The nudge can only reach the reading frontier: the prepared chapter
  // (the last one written) or the next unwritten one. A chapter behind
  // the frontier is settled history — later chapters already stand on
  // it — so a reader who has wandered back cannot aim at it either.
  const written = story.chapters?.length || 0
  if (written > 0 && target < written - 1) return null
  return target
}

const resolveInterventionText = (story, { text, kind, chipId }) => {
  if (kind === 'chip' && chipId && chipId !== 'fate') {
    const chip = interventionChipById(chipId)
    if (chip) return chip.text
  }
  if (kind === 'chip' || kind === 'random') {
    const seed = hash(`${story.id}|fate|${interventionsOf(story).length}`)
    return INTERVENTION_FATE_POOL[parseInt(seed, 36) % INTERVENTION_FATE_POOL.length]
  }
  return cleanBounded(text, INTERVENTION_TEXT_MAX)
}

// Queue one intervention against the story's next unread chapter. The
// caller supplies the reader's live position; the entry freezes its target
// at queue time, so later reading never retargets an older nudge onto a
// chapter it was not aimed at.
export function queueIntervention(story, { text = '', kind = 'text', chipId = '', readerIndex } = {}) {
  validateStory(story)
  if (story.readOnly === true) return story
  const targetIndex = interventionTargetIndex(story, readerIndex)
  if (targetIndex === null) {
    throw new RangeError(isStoryComplete(story)
      ? '这条故事线已经走完，没有下一章可以介入'
      : '介入只能落在阅读前沿的那一章，先读到最新章节再伸手')
  }
  const resolvedKind = kind === 'chip' || kind === 'random' ? kind : 'text'
  const resolvedText = resolveInterventionText(story, { text, kind: resolvedKind, chipId })
  if (!resolvedText) throw new RangeError('先写下你想让命运推动的事，或选一个现成的方向')
  const entry = {
    id: makeId('iv'),
    targetIndex,
    text: resolvedText,
    kind: resolvedKind,
    ...(resolvedKind === 'chip' && chipId ? { chipId } : {}),
    createdAt: now(),
    status: 'queued',
  }
  const next = clone(story)
  next.interventions = [...interventionsOf(story).map((item) => ({ ...item })), entry]
  // A content mutation like the branch rewrites before it: the revision
  // bump rotates the target chapter's key (with the signature) and makes
  // reactive readers re-run their preparation effect.
  next.revision = (story.revision || 0) + 1
  next.updatedAt = now()
  return next
}

// The chapter-key signature of a chapter's intervention queue: queueing a
// nudge for a chapter changes that chapter's key, which is what makes a
// pre-generated copy of it stale and routes the client into the revision
// pass instead of silently accepting the old text.
export const interventionSignatureFor = (story, index) =>
  interventionsForChapter(story, index).map((entry) => `${entry.id}:${entry.text}`).join('|')

const markInterventionsApplied = (next, index) => {
  if (!Array.isArray(next.interventions)) return
  next.interventions = next.interventions.map((entry) =>
    entry && entry.targetIndex === index && entry.status !== 'applied' ? { ...entry, status: 'applied' } : entry)
}

// The local-engine revision: drop the pre-generated copy of the target
// chapter so the reading window rebuilds it with the queued interventions
// woven in. Only the LAST chapter may be retracted, and never one at or
// behind the reading position — what has been read is history.
export function retractChapter(story, index) {
  validateStory(story)
  if (story.readOnly === true) return story
  if (!Number.isInteger(index) || index !== story.chapters.length - 1) return story
  const position = Number.isInteger(story.readerIndex) ? story.readerIndex : 0
  if (index <= position) return story
  const next = clone(story)
  next.chapters = next.chapters.slice(0, index)
  next.chapterIndex = Math.min(index, totalChaptersFor(next) - 1)
  next.updatedAt = now()
  return next
}

// The model-path revision: replace the pre-generated target chapter with
// its regenerated version, same slot, same id. The replacement must carry
// the key the current queue implies; the chapter it replaces and every
// chapter before it are otherwise untouched.
export function replaceChapter(story, chapter, key) {
  validateStory(story)
  if (story.readOnly === true) return story
  if (!chapter || !Number.isInteger(chapter.index)) return story
  const index = chapter.index
  if (index !== story.chapters.length - 1) return story
  const position = Number.isInteger(story.readerIndex) ? story.readerIndex : 0
  if (index <= position) return story
  if (typeof key !== 'string' || key !== chapterKey(story, index)) return story
  if (chapter.id !== `${story.id}:chapter:${index}:r${story.revision}`) return story
  const next = clone(story)
  next.chapters = [...story.chapters.slice(0, index).map((item) => clone(item)), clone(chapter)]
  markInterventionsApplied(next, index)
  next.updatedAt = now()
  return next
}

// 开启下一季: only a finished season story can roll over. The new story
// inherits the full config (world, identity, spawn, template, protagonist)
// with seasonNumber + 1 — the world bible then carries the escalation rule
// and an outline re-derived for the new season.
export function startNextSeason(story) {
  validateStory(story)
  if (story.kind === 'merged' || storyLengthModeOf(story) !== 'season') {
    throw new RangeError('只有季模式的故事能开启下一季')
  }
  if (!isStoryComplete(story)) {
    throw new RangeError('本季还没有读完，不能开启下一季')
  }
  const next = createStory({
    ...story.config,
    storyLengthMode: 'season',
    seasonNumber: (Number.isInteger(story.config.seasonNumber) ? story.config.seasonNumber : 1) + 1,
    step: 6,
  })
  next.previousSeasonId = story.id
  return next
}

/*
 * 设定集 (the owner's settings book): the owner may view and edit their
 * story's world bible and lorebook at any time. Edits follow the same
 * immutability rule as interventions — they shape chapters generated
 * AFTER the edit and never rewrite a chapter that already exists (these
 * helpers touch config / worldBible only, never chapters). The outline
 * is generated structure, not an editable entry: it is carried through
 * untouched.
 */
export const WORLD_BIBLE_PREMISE_MAX = 1000
export const WORLD_BIBLE_RULE_MAX = 600
export const WORLD_BIBLE_RULES_MAX = 12

export function updateWorldBible(story, patch = {}) {
  validateStory(story)
  const bible = story.worldBible && typeof story.worldBible === 'object' ? story.worldBible : {}
  const rules = patch.rules !== undefined
    ? (Array.isArray(patch.rules)
      ? patch.rules.map((rule) => cleanBounded(rule, WORLD_BIBLE_RULE_MAX)).filter(Boolean).slice(0, WORLD_BIBLE_RULES_MAX)
      : [])
    : (Array.isArray(bible.rules) ? [...bible.rules] : [])
  return {
    ...story,
    worldBible: {
      premise: patch.premise !== undefined ? cleanBounded(patch.premise, WORLD_BIBLE_PREMISE_MAX) : (bible.premise || ''),
      rules,
      endingAnchor: patch.endingAnchor !== undefined ? cleanBounded(patch.endingAnchor, WORLD_BIBLE_PREMISE_MAX) : (bible.endingAnchor || ''),
      outline: Array.isArray(bible.outline) ? [...bible.outline] : [],
    },
    updatedAt: now(),
  }
}

export function updateLorebook(story, entries) {
  validateStory(story)
  return {
    ...story,
    config: { ...story.config, lorebook: normalizeLorebookEntries(entries) },
    updatedAt: now(),
  }
}

/*
 * 本书简介 (the owner's blurb, EDIT-BOOK batch, DESIGN §29): a short
 * reader-facing introduction the owner writes for their own book. It
 * lives on the story record itself (`story.synopsis`) so it rides the
 * ordinary library sync like every other story field — no separate
 * channel. It is presentation text only: generation never reads it, so
 * editing it can never rewrite or invalidate a chapter.
 *
 * A book that predates the field has no stored synopsis; every display
 * falls back to the world bible's premise — the text those surfaces
 * already showed as the book's introduction before the field existed —
 * and the first explicit save materialises the owner's own words.
 * Saving an empty text clears the field back to that fallback.
 */
export const SYNOPSIS_MAX = 300

export function synopsisOf(story) {
  const own = typeof story?.synopsis === 'string' ? story.synopsis.trim() : ''
  if (own) return own
  const premise = typeof story?.worldBible?.premise === 'string' ? story.worldBible.premise.trim() : ''
  return premise
}

export function updateSynopsis(story, text) {
  validateStory(story)
  const cleaned = typeof text === 'string' ? text.trim() : ''
  if (cleaned.length > SYNOPSIS_MAX) {
    throw new RangeError(`简介最多 ${SYNOPSIS_MAX} 字`)
  }
  const current = typeof story.synopsis === 'string' ? story.synopsis : ''
  if (cleaned === current) return story
  const next = { ...story, updatedAt: now() }
  if (cleaned) next.synopsis = cleaned
  else delete next.synopsis
  return next
}

/*
 * 章节改名 (renaming a chapter, EDIT-BOOK batch, DESIGN §29): the
 * chapter title is metadata, not prose, so — unlike 编辑正文 — it is
 * NOT bound by the frontier rule: any chapter that exists may be
 * renamed at any time, including long-sealed ones. The helper touches
 * nothing else: chapter ids, order, paragraphs and summaries are
 * carried through byte-identical, and the story revision deliberately
 * does NOT advance (chapterKey binds to the revision, and a rename
 * must not retire a pre-generated next chapter whose context never
 * included the old title anyway). The updatedAt bump is what the
 * cloud library sync keys on, so a rename propagates like any edit.
 */
export const CHAPTER_TITLE_MAX = 30

export function renameChapterTitle(story, index, title) {
  validateStory(story)
  if (story.readOnly === true) return story
  if (!Number.isInteger(index) || index < 0 || index >= story.chapters.length) {
    throw new RangeError('这一章还没有写出来，没法改名。')
  }
  const cleaned = typeof title === 'string' ? title.trim() : ''
  if (!cleaned) throw new RangeError('章节标题不能为空。')
  if (cleaned.length > CHAPTER_TITLE_MAX) {
    throw new RangeError(`章节标题最多 ${CHAPTER_TITLE_MAX} 字。`)
  }
  if (cleaned === story.chapters[index].title) return story
  const next = clone(story)
  next.chapters[index] = { ...next.chapters[index], title: cleaned }
  next.updatedAt = now()
  return next
}

/*
 * 改书名 (renaming the book itself, TITLE-FLOW batch): the book's title
 * is presentation metadata, exactly like the synopsis and the chapter
 * titles — renaming rewrites no chapter, moves no id and does NOT
 * advance the revision (a pre-generated next chapter never carried the
 * title in its context). The updatedAt bump carries the rename through
 * the ordinary cloud sync; the server then mirrors it onto the book's
 * plaza publication, if it has one (see server/plaza.js
 * syncTitleForStory). The config's bookTitle copy is kept in step so a
 * later season roll-over inherits the CURRENT name, not the name the
 * book was born with. A read-only copy (a plaza line on the shelf) is
 * never renamed.
 */
export function renameBookTitle(story, title) {
  validateStory(story)
  if (story.readOnly === true) return story
  const cleaned = typeof title === 'string' ? title.trim() : ''
  if (!cleaned) throw new RangeError('书名不能为空。')
  if (cleaned.length > BOOK_TITLE_MAX) {
    throw new RangeError(`书名最多 ${BOOK_TITLE_MAX} 字。`)
  }
  if (cleaned === story.title) return story
  const next = { ...story, title: cleaned, updatedAt: now() }
  if (story.config && typeof story.config === 'object') {
    next.config = { ...story.config, bookTitle: cleaned }
  }
  return next
}

/*
 * 自己写 (WRITE-MODE batch, DESIGN §50): a book the owner writes by hand,
 * chapter by chapter, in their own words. It reuses the story record so
 * the shelf, the reader and the cloud library treat it like any other
 * book, but it carries `creationMode: 'manual'` and `engine: 'manual'`,
 * and those two marks are the whole contract:
 *
 * - No generation path may touch it: the model is never called for it,
 *   nothing is pre-generated, and it consumes no generation quota. The
 *   reading flow's materialiser and the chapter generator both refuse it.
 * - It has no avatar journey, so the avatar-world semantics (bringing an
 *   avatar in, fusion, intervention) do not exist for it; surfaces hide
 *   those entries rather than grey them into fake buttons.
 * - Its length mode is 'endless' purely as bookkeeping: there is no
 *   designed total, the book grows as the author writes, and the author
 *   finishes it by hand (finishEndlessLine) when it is done.
 *
 * The chapters are the author's own prose, stored as paragraphs split on
 * blank lines. Editing is free at ANY position — there is no frontier
 * rule for a hand-written book, because no generated chapter stands on
 * top of an earlier one.
 */
export const isManualStory = (story) => story?.creationMode === 'manual'

export const MANUAL_TAG_MAX = 12
export const MANUAL_TAGS_MAX = 5
export const MANUAL_CHAPTER_TEXT_MAX = 100_000

const cleanManualTags = (tags) => {
  if (!Array.isArray(tags)) return []
  const seen = new Set()
  const cleaned = []
  for (const raw of tags) {
    const tag = typeof raw === 'string' ? raw.trim().slice(0, MANUAL_TAG_MAX) : ''
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    cleaned.push(tag)
    if (cleaned.length >= MANUAL_TAGS_MAX) break
  }
  return cleaned
}

export const manualTagsOf = (story) => cleanManualTags(story?.config?.tags)

/**
 * Open a hand-written book: title and (optionally) the author's own
 * introduction, a family shelf to file it under, and free tags. No
 * world, no protagonist, no draft walk — the book starts empty and the
 * writing desk is where its chapters appear.
 */
export function createManualStory({ title = '', synopsis = '', shelfId = '', tags = [] } = {}) {
  const cleanedTitle = typeof title === 'string' ? title.trim() : ''
  if (!cleanedTitle) throw new RangeError('先给这本书起个名字。')
  if (cleanedTitle.length > BOOK_TITLE_MAX) {
    throw new RangeError(`书名最多 ${BOOK_TITLE_MAX} 字。`)
  }
  const cleanedSynopsis = typeof synopsis === 'string' ? synopsis.trim() : ''
  if (cleanedSynopsis.length > SYNOPSIS_MAX) {
    throw new RangeError(`简介最多 ${SYNOPSIS_MAX} 字。`)
  }
  const shelf = shelfById(typeof shelfId === 'string' ? shelfId : '')
  const timestamp = now()
  return {
    id: makeId(),
    creationMode: 'manual',
    engine: 'manual',
    title: cleanedTitle,
    genreId: CUSTOM_GENRE_ID,
    config: {
      genreId: CUSTOM_GENRE_ID,
      storyLengthMode: 'endless',
      bookTitle: cleanedTitle,
      manualShelfId: shelf ? shelf.id : '',
      tags: cleanManualTags(tags),
    },
    // The bible is a courtesy shell: surfaces that read a premise find
    // the author's own introduction there, and nothing else exists —
    // no rules, no outline, no ending, because no engine runs on it.
    worldBible: { premise: cleanedSynopsis, rules: [], endingAnchor: '', outline: [] },
    ...(cleanedSynopsis ? { synopsis: cleanedSynopsis } : {}),
    chapterIndex: 0,
    chapters: [],
    choices: {},
    revision: 0,
    kind: 'solo',
    sourceIds: [],
    author: '我',
    createdAt: timestamp,
    updatedAt: timestamp,
    bookmarked: false,
  }
}

/** Editor text ⇄ stored paragraphs: blank lines (or any newline run) split. */
export const manualTextToParagraphs = (text) =>
  (typeof text === 'string' ? text : '')
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

export const manualParagraphsToText = (paragraphs) =>
  (Array.isArray(paragraphs) ? paragraphs : []).filter((paragraph) => typeof paragraph === 'string' && paragraph.trim()).join('\n\n')

/** A chapter counts as written when it carries real prose. */
export const manualChapterHasProse = (chapter) =>
  (Array.isArray(chapter?.paragraphs) ? chapter.paragraphs : []).some((paragraph) => typeof paragraph === 'string' && paragraph.trim())

export const manualWrittenChapterCount = (story) =>
  (Array.isArray(story?.chapters) ? story.chapters : []).filter(manualChapterHasProse).length

export const manualChapterWordCount = (chapter) =>
  (Array.isArray(chapter?.paragraphs) ? chapter.paragraphs : []).join('').replace(/\s/g, '').length

const assertManualEditable = (story) => {
  validateStory(story)
  if (!isManualStory(story)) throw new RangeError('只有自己写的书能这样编辑。')
  if (story.readOnly === true) throw new RangeError('只读副本不能编辑。')
}

const reindexManualChapters = (chapters) =>
  chapters.map((chapter, index) => ({ ...chapter, index, id: `${chapter.id.split(':chapter:')[0]}:chapter:${index}:manual` }))

const withManualChapters = (story, chapters) => {
  const next = { ...story, chapters: reindexManualChapters(chapters), updatedAt: now() }
  next.chapterIndex = chapters.length
  if (Number.isInteger(next.readerIndex)) {
    next.readerIndex = Math.max(0, Math.min(next.readerIndex, Math.max(0, chapters.length - 1)))
  }
  return next
}

const cleanManualChapterTitle = (title, position) => {
  const cleaned = typeof title === 'string' ? title.trim() : ''
  if (!cleaned) return `第 ${position + 1} 章`
  if (cleaned.length > CHAPTER_TITLE_MAX) {
    throw new RangeError(`章节标题最多 ${CHAPTER_TITLE_MAX} 字。`)
  }
  return cleaned
}

const manualChapterRecord = (story, position, { title = '', text = '' } = {}) => {
  const cleanedText = typeof text === 'string' ? text : ''
  if (cleanedText.length > MANUAL_CHAPTER_TEXT_MAX) {
    throw new RangeError('这一章太长了，先分一章再写。')
  }
  const paragraphs = manualTextToParagraphs(cleanedText)
  return {
    id: `${story.id}:chapter:${position}:manual`,
    index: position,
    title: cleanManualChapterTitle(title, position),
    // An untouched new chapter stores one empty paragraph: the storage
    // contract requires a non-empty paragraph list, and an empty string
    // is the honest shape of "nothing written yet" — the publish gate
    // and every word count treat it as unwritten.
    paragraphs: paragraphs.length ? paragraphs : [''],
    summary: '',
    events: [],
    foreshadowing: [],
    choice: null,
  }
}

/** Append a chapter at the end of a hand-written book. */
export function appendManualChapter(story, draft = {}) {
  assertManualEditable(story)
  const position = story.chapters.length
  return withManualChapters(story, [...story.chapters, manualChapterRecord(story, position, draft)])
}

/** Replace one chapter's title and prose, in place. */
export function updateManualChapter(story, index, draft = {}) {
  assertManualEditable(story)
  if (!Number.isInteger(index) || index < 0 || index >= story.chapters.length) {
    throw new RangeError('这一章还不存在。')
  }
  const chapters = story.chapters.slice()
  chapters[index] = manualChapterRecord(story, index, draft)
  return withManualChapters(story, chapters)
}

/** Remove one chapter; the ones after it close ranks. */
export function removeManualChapter(story, index) {
  assertManualEditable(story)
  if (!Number.isInteger(index) || index < 0 || index >= story.chapters.length) {
    throw new RangeError('这一章还不存在。')
  }
  return withManualChapters(story, story.chapters.filter((_, position) => position !== index))
}

/** Move one chapter to a new position (the desk's up/down controls). */
export function moveManualChapter(story, from, to) {
  assertManualEditable(story)
  const length = story.chapters.length
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= length || to >= length) {
    throw new RangeError('章节位置不对。')
  }
  if (from === to) return story
  const chapters = story.chapters.slice()
  const [moved] = chapters.splice(from, 1)
  chapters.splice(to, 0, moved)
  return withManualChapters(story, chapters)
}

/*
 * 文风预设 (style presets): the owner's per-story directing dial for the
 * generation instructions. A preset is a bounded instruction block the
 * server appends to its system prompt for every chapter generated AFTER
 * the preset is set — it modulates pacing, texture and diction only.
 * The house 文笔总则 (drama first, no ornate AI prose, receipt density)
 * always stays in force ABOVE every preset: each block below opens by
 * submitting to it, so a preset can bend the telling but never repeal
 * the contract. 'default' carries no block at all — the instructions
 * for a default story are byte-identical to the pre-preset era.
 */
export const STYLE_PRESETS = [
  {
    id: 'default',
    label: '默认',
    description: '爽文总则的原味：事件与冲突为骨，回执密度照旧，不加任何额外口径。',
    instruction: '',
  },
  {
    id: 'compact',
    label: '紧凑爽快',
    description: '段落更短、切换更快，对话与行动优先，删去一切不推进事件的过渡。',
    instruction: '文风预设·紧凑爽快（本书作者选定；服从上文文笔总则，只调整节奏与质地，不改变事件密度、回执与代价口径）：段落更短，单段只完成一个清晰的动作；场景切换更快，对话与行动优先；删去一切不推进事件的过渡句与铺陈。章末钩子照常成立。',
  },
  {
    id: 'immersive',
    label: '细腻沉浸',
    description: '感官细节写足，人物反应有停顿和层次，段落可以更长——但不许景物代替冲突。',
    instruction: '文风预设·细腻沉浸（本书作者选定；服从上文文笔总则，只调整节奏与质地，不改变事件密度、回执与代价口径）：场景的感官细节（声音、气味、触感、光线）写足，人物反应给出停顿与层次，段落可以更长。仍然以事件与冲突推进，不得用景物或氛围代替冲突，禁止以意境收尾，章末钩子照常成立。',
  },
  {
    id: 'austere',
    label: '冷峻克制',
    description: '句子短而硬，情绪靠事实与动作呈现，不渲染、不解释心情。',
    instruction: '文风预设·冷峻克制（本书作者选定；服从上文文笔总则，只调整节奏与质地，不改变事件密度、回执与代价口径）：句子短而硬，情绪靠事实与动作呈现，不堆形容词，不解释人物心情；对话干脆，留白多于说明。章末钩子照常成立。',
  },
]

export const stylePresetById = (id) => STYLE_PRESETS.find((preset) => preset.id === id) || null

// The preset a story (or a bare config) currently runs under. Anything
// missing or unknown resolves to the default — pre-preset saves behave
// exactly as they always did.
export const stylePresetOf = (source) => stylePresetById(configOf(source)?.stylePreset) || STYLE_PRESETS[0]

export function updateStylePreset(story, presetId) {
  validateStory(story)
  if (story.readOnly === true) return story
  const preset = stylePresetById(presetId) || STYLE_PRESETS[0]
  return {
    ...story,
    config: { ...story.config, stylePreset: preset.id },
    updatedAt: now(),
  }
}

/*
 * 阅读前沿 (the reading frontier): the ONE place where direct rewriting
 * is still allowed. Interventions steer from outside and only ever aim
 * at the next chapter; these levers are the owner's hands on the chapter
 * being read itself — re-rolling it （换一版） or editing its prose.
 *
 * 定稿口径 (FRONTIER-FIX, superseding the CONTROL batch's rule): a
 * chapter finalises when the reader OPENS the next one — not when the
 * next one is generated. The pre-generated next chapter may already be
 * sitting in the record while its predecessor is still being directed;
 * mere generation moves nothing. The boundary therefore hangs on a
 * monotonic watermark, `story.openedThrough`: the highest chapter index
 * the reader has ever opened, advanced by the reading-position writes
 * (see advanceOpenedThrough) and never moved backwards — wandering back
 * to re-read an old chapter re-opens nothing, exactly as the house rule
 * （已发生的不可改写） demands. The frontier chapter is that watermark
 * chapter: editable until the reader opens the chapter after it.
 *
 * Records written before the watermark existed carry no field; for
 * them the frontier stays what it always was — the last chapter
 * written — so no settled history silently unlocks on upgrade. The
 * first recorded open on such a record seeds the watermark at the
 * last-but-one chapter (see advanceOpenedThrough for why), from which
 * point the new rule governs it like any other book.
 *
 * The boundary is enforced at every layer (affordance, request
 * validation, accept), so a race — the reader opening the next chapter
 * while a re-roll of this one is in flight — resolves in favour of the
 * lock: the late re-roll is refused whole and the chapter stands as
 * written.
 */
export const openedThroughIndex = (story) => {
  const count = Array.isArray(story?.chapters) ? story.chapters.length : 0
  if (count === 0) return -1
  const last = count - 1
  const opened = story?.openedThrough
  return Number.isInteger(opened) && opened >= 0 ? Math.min(opened, last) : last
}

export const frontierChapterIndex = (story) => openedThroughIndex(story)

export const isFrontierChapter = (story, index) =>
  Number.isInteger(index) && index >= 0 && index === frontierChapterIndex(story)

// Advance the opened-through watermark as the reader genuinely opens a
// chapter. Monotonic: a lower index (wandering back) changes nothing.
// The first recorded open on a record that predates the field seeds the
// watermark conservatively: preparation only ever runs one chapter
// ahead of the reader, so every written chapter except possibly the
// last was necessarily opened for the ones after it to exist — seeding
// at last-but-one keeps that settled history locked while the possibly
// unopened last chapter stays unfinalised until it is truly opened.
export function advanceOpenedThrough(story, index) {
  if (!story || typeof story !== 'object' || !Number.isInteger(index) || index < 0) return story
  const count = Array.isArray(story.chapters) ? story.chapters.length : 0
  if (count === 0) return story
  const last = count - 1
  const target = Math.min(index, last)
  const current = story.openedThrough
  if (Number.isInteger(current) && current >= 0) {
    return target > current ? { ...story, openedThrough: target } : story
  }
  return { ...story, openedThrough: Math.min(last, Math.max(target, last - 1)) }
}

// Open a re-roll of the frontier chapter: the revision bump is the
// mutation that makes the pass safe — it rotates the chapter key of the
// slot AND of the not-yet-written next chapter, so a pre-generation
// answer computed from the old telling can no longer land on top of
// the new one (the same rotation the intervention queue performs).
// A pre-generated copy of the next chapter may already have landed
// behind the frontier (FRONTIER-FIX): it was computed from the telling
// this pass is about to replace, so opening the re-roll retires it on
// the spot — the chapters after the frontier drop out of the record
// and the acceptance pointer rewinds with them, leaving the
// preparation machinery to rebuild the next chapter from the new
// telling. The retirement is plain record state (shorter chapters,
// rotated revision), never a silent side effect. A failed pass leaves
// the old chapter standing and simply costs that re-preparation.
export function beginChapterReroll(story, index) {
  validateStory(story)
  if (story.readOnly === true) return story
  if (!isFrontierChapter(story, index)) {
    throw new RangeError('只有正在读的这一章还能换一版——翻开下一章，这一章就定稿了')
  }
  const next = clone(story)
  next.revision = (story.revision || 0) + 1
  if (next.chapters.length > index + 1) {
    next.chapters = next.chapters.slice(0, index + 1)
    next.chapterIndex = Math.min(index + 1, totalChaptersFor(next) - 1)
  }
  next.updatedAt = now()
  return next
}

// Land a re-rolled chapter: swap the frontier slot for its fresh telling.
// Unlike replaceChapter (the intervention revision), the slot being
// swapped may be the chapter the reader is standing on — that is the
// whole point of the frontier exception — but it must still be the
// frontier chapter (the latest one the reader has opened), carry the
// key the rotated story implies, and bear the id of the current
// revision. The chapter's interventions (landed when it was
// first written, plus any still queued for it) are marked applied,
// because the fresh telling was generated with them in its brief — the
// marker and ledger recomputation itself happens at generation time,
// through the very same assembly the revision path uses.
export function replaceFrontierChapter(story, chapter, key) {
  validateStory(story)
  if (story.readOnly === true) return story
  if (!chapter || !Number.isInteger(chapter.index)) return story
  const index = chapter.index
  if (!isFrontierChapter(story, index)) return story
  if (typeof key !== 'string' || key !== chapterKey(story, index)) return story
  if (chapter.id !== `${story.id}:chapter:${index}:r${story.revision}`) return story
  const next = clone(story)
  next.chapters = [...story.chapters.slice(0, index).map((item) => clone(item)), clone(chapter)]
  markInterventionsApplied(next, index)
  // The swap rebuilds the record up to the slot: a copy of the next
  // chapter that landed mid-pass (FRONTIER-FIX) drops out with it, so
  // the acceptance pointer rewinds to the slot's successor — the same
  // value acceptChapter would have left for this chapter count.
  next.chapterIndex = Math.min(index + 1, totalChaptersFor(next) - 1)
  // Landing the swap rotates the revision a second time (FRONTIER-FIX):
  // a preparation fired while the pass was in flight is briefed on the
  // OLD telling yet keyed to the rotated record, so without this bump
  // its answer could land behind the new chapter and stand as the next
  // chapter. The bump makes every pre-swap answer stale on arrival;
  // the preparation machinery rebuilds it from the new telling.
  next.revision = (story.revision || 0) + 1
  next.updatedAt = now()
  return next
}

// Owner prose editing, frontier chapter only. The edited paragraphs
// become the chapter's canon verbatim: later generation reads its tail
// context from the story record, so the model continues from the
// owner's own words. The revision bump retires any in-flight
// pre-generation of the next chapter, whose context predates the edit;
// a pre-generated copy that has already LANDED behind the frontier is
// retired with it (FRONTIER-FIX) — dropped from the record and rebuilt
// from the edited tail, exactly as on a re-roll, never left standing
// on prose the owner has since replaced.
export const CHAPTER_PROSE_MAX_PARAGRAPHS = 64
export const CHAPTER_PROSE_PARAGRAPH_MAX = 4000

export function updateChapterProse(story, index, paragraphs) {
  validateStory(story)
  if (story.readOnly === true) return story
  if (!isFrontierChapter(story, index)) return story
  if (!Array.isArray(paragraphs) || paragraphs.length === 0 || paragraphs.length > CHAPTER_PROSE_MAX_PARAGRAPHS) {
    throw new RangeError(`正文要有 1–${CHAPTER_PROSE_MAX_PARAGRAPHS} 段`)
  }
  const cleaned = paragraphs.map((paragraph) => (typeof paragraph === 'string' ? paragraph.trim() : ''))
  if (cleaned.some((paragraph) => !paragraph || paragraph.length > CHAPTER_PROSE_PARAGRAPH_MAX)) {
    throw new RangeError(`每段都要有内容，且不超过 ${CHAPTER_PROSE_PARAGRAPH_MAX} 字`)
  }
  const next = clone(story)
  next.chapters[index] = { ...next.chapters[index], paragraphs: cleaned }
  next.revision = (story.revision || 0) + 1
  if (next.chapters.length > index + 1) {
    next.chapters = next.chapters.slice(0, index + 1)
    next.chapterIndex = Math.min(index + 1, totalChaptersFor(next) - 1)
  }
  next.updatedAt = now()
  return next
}

const ACT_LABELS = [
  '第 1 章 · 开篇',
  '第 2 章 · 信号',
  '第 3 章 · 展开',
  '第 4 章 · 越界',
  '第 5 章 · 转折',
  '第 6 章 · 结局',
]

const TONE_DIRECTIVES = {
  诗性冒险: '注重环境细节与场景氛围描写，推进主角探索过程。',
  悬疑推进: '注重线索铺垫、时间压力与前后因果逻辑。',
  群像治愈: '注重人物对话、互动关系与共同解决问题的过程。',
}

// 为每一章提供确定性的章节结构规划，供模型生成与阅读器剧情概览共享。
export function storyBeatPlan(story, index) {
  validateStory(story)
  validateIndex(index, story)
  const config = story.config || {}
  const genre = genreFor(story.genreId || config.genreId)
  const merged = story.kind === 'merged'
  const structure = structureFor(story, index)
  const name = merged
    ? (config.protagonists || []).map((item, idx) => protagonistName(item, `旅者${idx === 0 ? '甲' : '乙'}`)).join('与')
    : protagonistName(config)
  const identity = displayIdentity(config, genre)
  const ability = cleanText(config.ability, '') || '尚未命名的能力'
  const isCustom = genre.id === CUSTOM_GENRE_ID
  const worldDisplay = worldNameOf(genre, config)
  const customSetting = customSettingOf(config)
  const destination = cleanText(config.destination, '') || (isCustom ? worldDisplay : genre.location)
  const friend = cleanText(config.friend, '') || '同行者'
  const lived = realityDetail(config)
  const tone = cleanText(config.tone, '') || '诗性冒险'
  const toneDirective = TONE_DIRECTIVES[tone] || TONE_DIRECTIVES.诗性冒险
  const spawn = resolveStartPoint(genre, config)
  const spawnName = spawn?.name || genre.location

  const structureLine = structure.mode === 'season'
    ? `结构：一季 24 章，第 ${structure.unitIndex + 1} 幕（共 4 幕），幕内第 ${structure.positionInUnit + 1} 章；${structure.isFinale ? '本章是季终大升格点：收束全季、结算全部代价并打开下一季的门' : structure.isUnitEnd ? '本章是本幕的小升格点：标尺当场跳一格，本幕代价在此结算' : '每幕第 6 章为小升格点，第 24 章为季终大升格'}`
    : structure.mode === 'long'
      ? `结构：长线 100 章，第 ${structure.unitIndex + 1} 弧（共 4 弧），弧内第 ${structure.positionInUnit + 1} 章；${structure.isFinale ? '本章是长线终局：全线收束并结算' : structure.isUnitEnd ? '本章是弧末大节点：完成本弧结算与升格，以弧过渡进入下一弧' : '每弧第 25 章为弧末大节点'}`
      : structure.mode === 'custom'
        ? `结构：自定义篇幅共 ${structure.total} 章，第 ${structure.unitIndex + 1} 幕（共 4 幕），幕内第 ${structure.positionInUnit + 1} 章；${structure.isFinale ? '本章是终章大升格点：收束全线、结算全部代价' : structure.isUnitEnd ? '本章是本幕的小升格点：标尺当场跳一格，本幕代价在此结算' : '每幕末章为小升格点，末章为终章大升格'}`
        : structure.mode === 'endless'
          ? `结构：无限连载（没有预设终章），第 ${structure.unitIndex + 1} 弧（每 ${ENDLESS_ARC_CHAPTERS} 章一弧），弧内第 ${structure.positionInUnit + 1} 章；${structure.isUnitEnd ? '本章是本弧的小升格点：标尺当场跳一格，本弧代价在此结算，并自然打开下一弧' : '不要收束全线、不要写结局，只在本弧内推进；每弧末章为小升格点'}`
          : `结构：短季 6 章，本章为第 ${index + 1} 章${structure.isFinale ? '，本卷在此收束并结算代价' : ''}`

  const prerequisites = [
    isCustom
      ? (spawn ? `世界：${worldDisplay}（由创世者亲手写定的世界；出生点：${spawn.name}）` : `世界：${worldDisplay}（由创世者亲手写定的世界）`)
      : `世界：${genre.world}（出生点：${spawnName}）`,
    ...(isCustom && customSetting ? [`创世设定：${customSetting}`] : []),
    merged
      ? `双主角合流：${name}（规则：${config.merge?.rules === 'separate' ? '各自独立' : '互相融合'}，关系：${config.merge?.bond === 'rivals' ? '竞争' : '合作'}）`
      : `主角：${name}，身份“${identity}”，性格“${cleanText(config.trait, '') || '冷静观察者'}”`,
    // The origin identity is a long-lived background fact: later chapters may
    // refer back to who the protagonist IS in this world, even though the
    // spawn point itself only ever grounds chapter one.
    ...(originBeatLine(genre, config) ? [originBeatLine(genre, config)] : []),
    // The effect line rides when the book carries one (REQ-57): a
    // signature or hand-written power is only defined by its effect,
    // and a library pick means its printed effect too. The bible's
    // generic cost rule still governs every path alike.
    config.abilityDesc ? `能力：${ability}（${cleanText(config.abilityDesc, '')}）` : `能力：${ability}`,
    structureLine,
  ]
  if (lived && !merged) prerequisites.push(`现实背景：${lived}`)

  // 已经落地的介入是长篇的既成事实：它们作为前置事实进入每一章的规划，
  // 后续章节必须让那股外力的影响留痕，而不是当它从未发生。
  const landedBefore = priorInterventions(story, index)
  const unlockedInterventions = landedBefore.map((entry) => ({
    chapter: entry.targetIndex + 1,
    text: entry.text,
    kind: entry.kind,
  }))
  for (const entry of landedBefore) {
    prerequisites.push(`第 ${entry.targetIndex + 1} 章介入：“${entry.text}”——无名外力已搅动世界线，其影响须在后续留痕`)
  }
  // 本章要落地的介入（排队中）：beat plan 只报事实，落地方式由生成上下文
  // 的 interventions 字段与系统提示共同约束（写成事件，不写旁白）。
  const landingHere = queuedInterventionsFor(story, index)
  for (const entry of landingHere) {
    prerequisites.push(`本章介入：“${entry.text}”——须在本章写成真实发生的事件（巧合、异象、某人的到来或运气的转向），不得跳出故事解释`)
  }

  const mustGroundFinale = [
    `回应主线目标：${story.worldBible?.endingAnchor || '完成主线故事收尾'}`,
    `交代此前事件与历次介入带来的最终结果，完成结局`,
  ]
  const mustGroundUnitEnd = [
    `承接此前局势变化（包括历次介入留下的影响）`,
    structure.mode === 'long'
      ? `完成本弧结算：标尺跳格、代价清账，并以弧过渡打开下一弧`
      : `完成本${structure.unitLabel}结算：标尺跳一格、代价清账，并为下一${structure.unitLabel}留下明确钩子`,
  ]
  const mustGroundByPosition = [
    [
      isCustom
        ? (spawn ? `交代${name}在${spawn.name}醒来的处境与能力“${ability}”` : `交代${name}在${worldDisplay}的处境与能力“${ability}”`)
        : `交代${name}在${spawnName}的处境与能力“${ability}”${spawn?.hook ? `；开局处境：${spawn.hook}` : ''}`,
      `引出主线事件与世界基本规则`,
    ],
    [
      `推进指向“${destination}”的线索`,
      `把第一个转折推到台前，章末以事件钩子收束（新人物出现、新消息抵达、新危机爆发或一个决定被当众抛出）`,
    ],
    [
      `承接此前剧情变化（包括历次介入留下的影响）`,
      merged
        ? `展现双主角在合流点的配合与新冲突`
        : `在${destination}推进与${friend}相关的线索`,
    ],
    [
      `升级主要矛盾，要求${name}做出判断`,
      `把主要矛盾的代价与各方立场摆上台面，章末以事件钩子收束`,
    ],
    [
      `承接此前局势变化（包括历次介入留下的影响）`,
      structure.mode === 'short' ? `推进主线冲突进入结局前的关键阶段` : `推进主线冲突进入本${structure.unitLabel}的关键阶段`,
    ],
    mustGroundUnitEnd,
  ]

  const dramaticQuestions = [
    '交代主角背景、当前处境与故事起点。',
    '推进主线线索，把第一个转折推到台前。',
    '承接前文的结果，展开新场景。',
    '矛盾升级，把代价与立场逼到明处。',
    '承接前文的局势变化，推向高潮。',
    '解决核心冲突，交代故事结局。',
  ]

  // Turning-beat chapters (positions 1 and 3 of each six-block) end on an
  // event hook instead of a decision: the rhythm that used to carry the
  // choices now carries the hooks. Every other chapter uses the plain
  // forward shape.
  const paragraphShape = decisionTypeAt(index) !== null
    ? [
      '承接上文场景，不重复上一章结尾原句',
      '通过具体行动与对话推进冲突',
      '以事件钩子结束本章：新人物、新消息、新危机或当众抛出的决定，四者至少其一',
    ]
    : [
      '承接当前场景或前文的结果',
      '通过具体事件与人物互动推进剧情',
      '补充与当前情节直接相关的信息',
      '自然收尾并引出下一章内容',
    ]

  return {
    chapterNumber: index + 1,
    act: structure.mode === 'short'
      ? ACT_LABELS[index]
      : `第 ${structure.unitIndex + 1} ${structure.unitLabel} · 第 ${structure.positionInUnit + 1} 章（全${structure.mode === 'season' ? '季' : '线'}第 ${index + 1} 章）`,
    dramaticQuestion: structure.isFinale
      ? dramaticQuestions[5]
      : structure.mode === 'endless' && structure.beatPosition === 5
        ? '结清这一弧的账：标尺跳格、代价清账，并打开下一弧的门。'
        : dramaticQuestions[structure.beatPosition],
    prerequisites,
    mustGround: structure.isFinale ? mustGroundFinale : mustGroundByPosition[structure.beatPosition],
    unlockedInterventions,
    toneDirective,
    paragraphShape,
    structure: {
      mode: structure.mode,
      // A running endless line has no total; the beat plan says so
      // explicitly (null) instead of leaking Infinity into JSON payloads.
      totalChapters: Number.isFinite(structure.total) ? structure.total : null,
      unitIndex: structure.unitIndex,
      unitCount: structure.unitCount,
      unitLabel: structure.unitLabel,
      positionInUnit: structure.positionInUnit,
      isUnitEnd: structure.isUnitEnd,
      isFinale: structure.isFinale,
      upgradeKind: structure.upgradeKind,
    },
  }
}

// 为阅读器提供不剧透未来的「故事脉络」档案（仅聚合至 lastAccessibleIndex）。
export function storyNarrativeDossier(story, maxChapterIndex = 0) {
  validateStory(story)
  const total = totalChaptersFor(story)
  const limit = Math.max(0, Math.min(total - 1, Number.isInteger(maxChapterIndex) ? maxChapterIndex : 0))
  const genre = genreFor(story.genreId || story.config.genreId)
  const currentBeat = storyBeatPlan(story, limit)
  const groundedSet = new Set(currentBeat.prerequisites)
  for (let i = 0; i <= limit; i += 1) {
    const plan = storyBeatPlan(story, i)
    for (const item of plan.mustGround) groundedSet.add(item)
  }
  const activeConsequences = []
  for (let gate = 0; gate <= limit; gate += 1) {
    if (decisionTypeAt(gate) === null) continue
    const chosenId = validChoiceAt(story, gate)
    const option = legacyChoiceAt(story, gate)?.options.find((opt) => opt.id === chosenId)
    if (option) {
      activeConsequences.push({
        chapterNumber: gate + 1,
        choiceId: option.id,
        label: option.label,
        detail: option.detail,
        consequence: option.consequence,
      })
    }
  }
  const timeline = []
  for (let i = 0; i <= limit; i += 1) {
    const chapter = chapterForReading(story, i) || story.chapters?.[i]
    if (!chapter) continue
    const chosenId = validChoiceAt(story, i)
    const option = legacyChoiceAt(story, i)?.options.find((opt) => opt.id === chosenId)
    timeline.push({
      chapterIndex: i,
      chapterNumber: i + 1,
      title: chapter.title,
      act: total <= 6 ? ACT_LABELS[i] : storyBeatPlan(story, i).act,
      summary: chapter.summary || '',
      choiceLabel: option ? option.label : null,
    })
  }
  const origin = originSummaryFor(genre, story.config)
  const ledger = storyLedgerFor(story, limit)
  return {
    worldName: worldNameOf(genre, story.config),
    location: resolveStartPoint(genre, story.config)?.name || genre.location,
    protagonistOrigin: origin
      ? (origin.localTitle !== origin.name ? `${origin.name}·${origin.localTitle}` : origin.name)
      : '',
    premise: story.worldBible?.premise || '',
    rules: Array.isArray(story.worldBible?.rules) ? [...story.worldBible.rules] : [],
    endingAnchor: story.worldBible?.endingAnchor || '',
    currentBeat,
    groundedConcepts: [...groundedSet],
    activeConsequences: activeConsequences.slice(-6),
    timeline,
    ledger: {
      events: ledger.events.slice(-12),
      openForeshadowing: ledger.foreshadowing.slice(-8),
    },
  }
}

// Exact signatures of the early local templates, which narrated a decision's
// result inside the decision chapter. Never use a broad text replacement here:
// prose written by a user or a future model must remain untouched.
const legacyDecisionSignature = (story, index, currentScene) => {
  const config = story.config
  const genre = genreFor(story.genreId || config.genreId)
  const ability = cleanText(config.ability, '') || '尚未命名的能力'
  const friend = cleanText(config.friend, '') || '一个尚未现身的同行者'
  const destination = cleanText(config.destination, '') || genre.location
  if (story.kind === 'merged') {
    return {
      outcomes: index === 1
        ? ['他们先在各自的边界上停下，交换了三条不能触碰的规则。', '他们并肩踏入合流点，脚下同时亮起两种不同颜色的光。']
        : ['两套规则保持距离，反而在缝隙里找到不伤害彼此的节奏。', '规则互相翻译，陌生的词语第一次拥有了共同的意思。'],
      tail: currentScene[2],
    }
  }
  const outcomes = index === 1 ? {
    mist: ['TA把信压在掌心，没有让钟声替自己做决定。', 'TA让蓝火沿着指尖亮起，信纸背面浮出一条新的航线。'],
    cultivation: ['TA先把火印封进旧符，去寻找能证明它来历的证人。', 'TA将火印按进心口，听见云海之上有人喊出自己的名字。'],
    neon: ['TA先切断外网，把那句声音写进一块不会联网的旧芯片。', 'TA允许备份读取一秒钟的心跳，城市的广告牌同时暗了下来。'],
    city: ['TA先把留言留在站牌下，决定查清是谁把自己的名字写了上去。', 'TA沿着留言登上一班没有终点的电车，听见陌生人叫出自己的名字。'],
  } : {
    mist: [`TA回到${friend}留下的旧坐标，发现那里藏着一盏仍然温热的灯。`, `TA用“${ability}”缝合裂开的门缝，听见雾海另一端有人回应。`],
    cultivation: [`TA回到${friend}的门下，把证据放在众人面前，先守住可以回来的路。`, `TA以“${ability}”引火入脉，让一条凡人也能走的路从废墟里升起。`],
    neon: [`TA回到${friend}留下的安全屋，先保存一份可以撤回的证据。`, `TA用“${ability}”把两份冲突人格暂时缝在一起，让系统看见自己的盲点。`],
    city: [`TA回到${friend}熟悉的街角，先把能回来的门留给所有人。`, `TA用“${ability}”让一条旧街重新亮起，路牌开始显示真正的名字。`],
  }
  const tails = index === 1 ? {
    mist: `航线指向${destination}，而潮汐正在倒着退去。`,
    city: `电车驶向${destination}，窗外的街景却像在倒带。`,
  } : {
    neon: '雨幕第一次把所有人的脸还给了他们。',
    city: '有人按下了重启键，城市却选择继续做梦。',
  }
  // Worlds added after the legacy templates (court, frontier) never produced
  // legacy decision prose, so they have no signature to match.
  return { outcomes: outcomes[genre.id] || [], tail: tails[genre.id] || currentScene[2] }
}

/*
 * Display-layer paragraphing (READER-PARA). Early generated chapters
 * could land as a handful of multi-hundred-character paragraphs — a
 * wall of text in the reader even though every word was fine. The
 * stored record is the author's canon and is never rewritten for
 * this; instead the read-time view below re-paragraphs a chapter
 * whose shape is a wall, and only that shape:
 *
 *   a chapter needs display segmentation when its prose totals at
 *   least 600 characters AND (its longest paragraph exceeds 420
 *   characters OR its average paragraph exceeds 300 characters OR
 *   it has at most 3 paragraphs totalling at least 1000 characters).
 *
 * Chapters below the total floor, and chapters already carrying a
 * normal paragraph shape, come back byte-identical (same array), so
 * reading positions, bookmarks and search keep the identity they
 * were recorded against. When segmentation does run, only the
 * over-long paragraphs are re-cut; healthy paragraphs pass through
 * untouched.
 *
 * The cut itself is conservative: boundaries fall only at sentence
 * ends (。！？；… and the closers that trail them), never inside a
 * sentence — including inside quotes. Sentences aggregate toward a
 * 70–140 character band; a sentence that opens a quotation starts a
 * new paragraph (dialogue stands on its own), except when it
 * directly follows a short lead-in ending in a colon, and narration
 * likewise starts a new paragraph once a quotation has closed.
 * A single
 * sentence longer than 320 characters may be clause-cut at commas,
 * and only where no quotation is open at the comma.
 */
export const DISPLAY_SEGMENT_MIN_TOTAL = 600
export const DISPLAY_SEGMENT_MAX_PARAGRAPH = 420
export const DISPLAY_SEGMENT_MAX_AVERAGE = 300

const DISPLAY_CLOSERS = new Set([...'」』）)】〕〉》"”’'])
const isDisplayQuoteOpen = (char) => char === '「' || char === '『' || char === '“'

export function paragraphsNeedSegmentation(paragraphs) {
  if (!Array.isArray(paragraphs)) return false
  const lengths = paragraphs
    .filter((paragraph) => typeof paragraph === 'string')
    .map((paragraph) => paragraph.trim().length)
    .filter((length) => length > 0)
  if (!lengths.length) return false
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (total < DISPLAY_SEGMENT_MIN_TOTAL) return false
  const max = Math.max(...lengths)
  const average = total / lengths.length
  return max > DISPLAY_SEGMENT_MAX_PARAGRAPH
    || average > DISPLAY_SEGMENT_MAX_AVERAGE
    || (lengths.length <= 3 && total >= 1000)
}

// Split one block of prose into sentences. A sentence ends at a
// sentence-final mark (plus any enders and closers trailing it) or at
// a decimal-safe ASCII full stop; a newline always closes a sentence
// and is reported via `breakAfter` so scene breaks survive.
function splitDisplaySentences(block) {
  const sentences = []
  let current = ''
  let index = 0
  const push = (breakAfter) => {
    const text = current.trim()
    if (text) sentences.push({ text, breakAfter: Boolean(breakAfter) })
    current = ''
  }
  while (index < block.length) {
    const char = block[index]
    if (char === '\n') { push(true); index += 1; continue }
    current += char
    index += 1
    const isEnder = char === '。' || char === '！' || char === '？' || char === '；' || char === '…'
    const isAsciiStop = char === '.'
      && !/\d/.test(block[index - 2] || '')
      && (index >= block.length || /[\s"”」』]/.test(block[index]))
    if (!isEnder && !isAsciiStop) continue
    // Consume the rest of the ender run (……, ！？) and its closers.
    while (index < block.length) {
      const next = block[index]
      if (next === '…' || next === '。' || next === '！' || next === '？' || DISPLAY_CLOSERS.has(next)) {
        current += next
        index += 1
      } else break
    }
    push(false)
  }
  push(false)
  return sentences
}

// Clause-cut one monster sentence (> 320 chars) at commas where no
// quotation is open; returns the sentence whole when no safe comma
// exists. Sentences are never cut anywhere else.
function clauseCutSentence(sentence) {
  if (sentence.length <= 320) return [sentence]
  const pieces = []
  let depth = 0
  let start = 0
  for (let index = 0; index < sentence.length; index += 1) {
    const char = sentence[index]
    if (isDisplayQuoteOpen(char)) depth += 1
    else if (char === '」' || char === '』' || char === '”') depth = Math.max(0, depth - 1)
    if (depth === 0 && (char === '，' || char === '、') && index - start >= 110 && sentence.length - index > 40) {
      pieces.push(sentence.slice(start, index + 1))
      start = index + 1
    }
  }
  if (!pieces.length) return [sentence]
  const tail = sentence.slice(start)
  if (tail) pieces.push(tail)
  return pieces
}

const startsWithDialogue = (text) => {
  const first = text.trimStart().charAt(0)
  return first === '「' || first === '『' || first === '“'
}

/** Re-paragraph one over-long block of prose for display. */
export function segmentTextForDisplay(text) {
  if (typeof text !== 'string') return []
  const paragraphs = []
  for (const block of text.split(/\n+/)) {
    let current = ''
    const flush = () => { if (current) { paragraphs.push(current); current = '' } }
    for (const { text: rawSentence, breakAfter } of splitDisplaySentences(block)) {
      for (const sentence of clauseCutSentence(rawSentence)) {
        if (!current) { current = sentence; continue }
        const dialogue = startsWithDialogue(sentence)
        const colonLead = /[：:]$/.test(current) && current.length < 40
        if (dialogue && !colonLead && current.length >= 24) { flush(); current = sentence; continue }
        // The alternation cuts both ways: once a quotation has closed
        // inside this paragraph, plain narration starts a new one.
        if (!dialogue && current.length >= 30 && /[」”]/.test(current)) { flush(); current = sentence; continue }
        if (current.length >= 140) { flush(); current = sentence; continue }
        if (current.length >= 70 && current.length + sentence.length > 140) { flush(); current = sentence; continue }
        current += sentence
      }
      if (breakAfter) flush()
    }
    flush()
  }
  return paragraphs
}

/**
 * The display form of a chapter's paragraphs: the SAME array when the
 * chapter's shape is already readable; a new array (healthy paragraphs
 * untouched, walls re-cut) when it is not.
 */
export function displayParagraphsFor(paragraphs) {
  if (!paragraphsNeedSegmentation(paragraphs)) return paragraphs
  const display = []
  for (const paragraph of paragraphs) {
    if (typeof paragraph !== 'string' || paragraph.trim().length <= DISPLAY_SEGMENT_MAX_PARAGRAPH) {
      display.push(paragraph)
    } else {
      display.push(...segmentTextForDisplay(paragraph))
    }
  }
  return display
}

/**
 * The printable form of a chapter title: the stored title, trimmed — or
 * '' when there is nothing worth printing next to 「第 N 章」. Early
 * generated chapters sometimes landed with the model echoing the bare
 * chapter number as the title, which read as 「第 3 章 · 3」 in the
 * reader header, the chapter list and the plaza beat list. Display
 * falls back to the ordinal alone (ENTRY-OPTIONS); generation now
 * refuses a bare-number title outright (server/gemini.js), so new
 * chapters never need the fallback.
 */
export function chapterTitleTextFor(title) {
  const text = typeof title === 'string' ? title.trim() : ''
  if (!text) return ''
  if (/^[\d０-９]+$/.test(text)) return ''
  return text
}

// A read-time compatibility view: no mutation, revision change, or chapter
// generation. Missing chapters return null; callers retain their own fallback.
// The read-time view's final step: a wall-shaped chapter is shown
// re-paragraphed (displayParagraphsFor); anything else is the chapter
// itself, identity included. The stored record is never touched.
const withDisplayParagraphs = (chapter) => {
  if (!chapter || !Array.isArray(chapter.paragraphs)) return chapter
  const paragraphs = displayParagraphsFor(chapter.paragraphs)
  return paragraphs === chapter.paragraphs ? chapter : { ...chapter, paragraphs }
}

export function chapterForReading(story, index) {
  validateStory(story)
  validateIndex(index, story)
  const stored = story.chapters.find((chapter) => chapter?.index === index)
  if (!stored) return null
  // A hand-written chapter is already the author's final text: the only
  // read-time courtesy it gets is the display re-paragraphing (a long
  // hand-typed paragraph reads as a wall otherwise, READER-PARA §44).
  // The legacy decision-scene repair below must never run on it.
  if (story.engine === 'gemini' || isManualStory(story)) return withDisplayParagraphs(stored)
  if ((index !== 1 && index !== 3) || !Array.isArray(stored.paragraphs)) return withDisplayParagraphs(stored)
  const currentScene = sceneFor(story, index)
  const signature = legacyDecisionSignature(story, index, currentScene)
  const [opening, outcome, tail] = stored.paragraphs
  if (opening !== currentScene[0] || !signature.outcomes.includes(outcome) || tail !== signature.tail) return withDisplayParagraphs(stored)

  const choices = legacyChoiceAt(story, 1).options
  const selected = choices.find((option) => option.id === validChoiceAt(story, 1))
  const legacyEchoes = new Set(choices.map((option) => `选择“${option.id}”留下的回声正在改变这一章。`))
  const remaining = stored.paragraphs.slice(3).flatMap((paragraph) => {
    if (!legacyEchoes.has(paragraph)) return [paragraph]
    return selected ? [`“${selected.label}”的决定仍在回响，${selected.consequence}`] : []
  })
  return withDisplayParagraphs({ ...stored, paragraphs: [...currentScene, ...remaining] })
}

export function chapterKey(story, index) {
  validateStory(story)
  validateIndex(index, story)
  // The key binds the chapter to the story's revision and to the
  // intervention queue aimed at THIS chapter: queueing a nudge changes the
  // key, which is exactly what makes a pre-generated copy of the chapter
  // stale and forces the revision pass. (Before retirement the payload
  // carried the preceding choices; those are inert data now and no longer
  // distinguish one telling from another.)
  const payload = `${story.id}|${story.revision}|${index}|${interventionSignatureFor(story, index)}`
  return `chapter-key:${hash(payload)}`
}

/*
 * LEGACY — records a pre-retirement branch choice on an old story.  The
 * product no longer calls this (the reader renders no choices and
 * generation ignores the recording); it survives so archived tooling and
 * fixtures that walk old saves keep working, and so a recorded choice on a
 * legacy story can still be amended without corrupting its later entries.
 * New code must steer through queueIntervention instead.
 */
export function chooseBranch(story, index, choiceId) {
  validateStory(story)
  if (story.readOnly === true) return story
  validateIndex(index, story)
  if (typeof choiceId !== 'string' || !choiceId.trim()) throw new RangeError('choiceId must be a non-empty string')
  const chapter = story.chapters.find((item) => item?.index === index)
  if (!chapter) throw new RangeError('cannot choose a branch before accepting that chapter')
  const currentChoice = legacyChoiceAt(story, index)
  if (!currentChoice || !currentChoice.options.some((option) => option.id === choiceId)) {
    throw new RangeError(`invalid choice ${choiceId} for chapter ${index}`)
  }
  if (story.choices?.[index] === choiceId) return story
  const next = clone(story)
  // Rewriting an earlier node invalidates every choice made in the future.
  // Keep only the decisions that precede this node, then record the new one;
  // otherwise a stale later choice could silently satisfy a new chapter gate.
  const precedingChoices = Object.fromEntries(
    Object.entries(story.choices || {}).filter(([chapter]) => Number(chapter) < index),
  )
  next.choices = { ...precedingChoices, [index]: choiceId }
  next.revision = Number(story.revision || 0) + 1
  next.chapters = story.chapters.slice(0, index + 1).map((item) => clone(item))
  // Preserve accepted prose; only the precisely recognized old prototype
  // decision scenes need compatibility repair when rewriting a branch.
  next.chapters[index] = chapterForReading(next, index)
  next.chapterIndex = Math.min(index + 1, totalChaptersFor(next) - 1)
  next.updatedAt = now()
  return next
}

export function acceptChapter(story, chapter, key) {
  validateStory(story)
  if (story.readOnly === true) return story
  if (!chapter || !Number.isInteger(chapter.index) || chapter.index < 0 || chapter.index >= totalChaptersFor(story)) return story
  const index = chapter.index
  if (typeof key !== 'string' || key !== chapterKey(story, index)) return story
  if (index !== story.chapterIndex) return story
  if (story.chapters.some((item) => item?.index === index)) return story
  const expectedId = `${story.id}:chapter:${index}:r${story.revision}`
  if (chapter.id !== expectedId) return story
  // No decision gate remains: the previous chapter never blocks this one.
  const next = clone(story)
  next.chapters = [...story.chapters.map((item) => clone(item)), clone(chapter)]
  // The chapter's interventions have landed: flip them to applied so the
  // ledger, the beat plans and later sync all see them as history.
  markInterventionsApplied(next, index)
  next.chapterIndex = Math.min(index + 1, totalChaptersFor(next) - 1)
  next.updatedAt = now()
  return next
}

const publicConfigFor = (config, name = '匿名旅者') => ({
  ...normalizeDraft({ ...config, name, immersive: false, hometown: '', role: '', friend: '', destination: '' }),
  name,
  immersive: false,
  hometown: '',
  school: '',
  company: '',
  role: '',
  friend: '',
  destination: '',
  // Imported material is the owner's private stock: a merge hand-off
  // carries neither side's lorebook nor persona text. Each source book
  // keeps its own; the merged line starts with an empty book.
  lorebook: [],
  persona: '',
  // The style preset is the owner's own directing hand, not part of the
  // world being handed off: a merged line starts on the default preset,
  // and every public snapshot does the same.
  stylePreset: 'default',
})

// A share snapshot is stricter than a merge hand-off.  It keeps the genre and
// the shape of the story, but removes any free-form identity details that a
// player might have typed for themselves.
const redactedSnapshotConfig = (config, name) => ({
  ...publicConfigFor(config, name),
  name,
  trait: '匿名探索者',
  origin: '未知来处',
  ability: '匿名火种',
  tone: '温和叙事',
  immersive: false,
  hometown: '',
  role: '',
  friend: '',
  destination: '',
  // A god-mode spawn point is free-form creator text; a share snapshot must
  // not carry it (the snapshot resolves to the world's default spawn point).
  startPointName: '',
  startPointHook: '',
  // The avatar link is the owner's own thread back to their character; a
  // public snapshot is anonymous and keeps neither the id nor the look.
  avatarId: '',
  avatarAppearance: '',
  // Where an entered line came from is the entrant's own bookkeeping; a
  // snapshot never points back at another reader's publication.
  sourcePublicationId: '',
  // The manual-finish mark is the owner's own state: an entrant into this
  // world starts a fresh, still-running line, never a pre-finished one.
  finishedAt: '',
  // Imported world material and the persona text are the owner's private
  // stock （外部导入）: a snapshot carries the world itself (name + the
  // sanitised setting, exactly like a god-mode world) but NEVER the
  // lorebook entries or the persona — those stay in the owner's book.
  lorebook: [],
  persona: '',
  // The creator's typed book title is likewise their own stock: a
  // snapshot's name is its redacted story.title field, never this raw
  // config copy (which may quote private literals verbatim).
  bookTitle: '',
})

/*
 * 合流组合规则 (fusion combination table, FUSION2): for fusion purposes a
 * source line is in exactly one of two states —
 * - 'serializing' （连载中）: an endless line still running — not finished
 *   by hand, not complete. It has no ending to hand over, so any fusion
 *   it joins must keep running too.
 * - 'finished' （完结）: the line has reached its end — a finite line at
 *   its total, or an endless line its owner finished by hand. A finite
 *   line still mid-run also counts on this side: its unwritten remainder
 *   is NOT carried into the product — the fusion opens a fresh short
 *   book, exactly as merges always have.
 * The product mode follows the table: 完结×完结 → short (the historical
 * cap); any combination touching a serialising line → endless, rolling
 * on with no finale until its owner finishes it by hand. Since
 * 2026-10-30 the table is only the DEFAULT: createMergedStory honours
 * an explicit reader-chosen length (short / season / long / endless)
 * over it, exactly like an ordinary forge's length menu.
 */
export const fusionSourceStateFor = (source) => {
  if (!source || typeof source !== 'object') return 'finished'
  return storyLengthModeOf(source) === 'endless' && !isManuallyFinished(source) ? 'serializing' : 'finished'
}

export const fusionProductModeFor = (a, b) =>
  fusionSourceStateFor(a) === 'serializing' || fusionSourceStateFor(b) === 'serializing' ? 'endless' : 'short'

export function createMergedStory(a, b, options = {}) {
  validateStory(a)
  validateStory(b)
  // 防自融 / 防套娃： a line never fuses with itself, and a fused line —
  // already the crystal of two lines — never serves as a fusion source
  // again. The merge UI filters both out before this point; the engine
  // refuses them outright so no caller can mint a nested line.
  if (a.id === b.id) throw new RangeError('同一条故事线不能和自己合流。')
  if (a.kind === 'merged' || b.kind === 'merged') {
    throw new RangeError('合流故事是两条线合流的结晶，不能再作合流的来源。')
  }
  const rules = options.rules === 'separate' ? 'separate' : 'bridge'
  const lead = options.lead === 'b' ? 'b' : 'a'
  const bond = options.bond === 'rivals' ? 'rivals' : 'allies'
  // Length is the reader's choice (owner ruling 2026-10-30): an explicit
  // options.storyLengthMode (short / season / long / endless — the same
  // menu as an ordinary forge) wins; only when no choice was made does
  // the combination table decide (finished × finished → short, any
  // serialising source → endless).
  const chosenMode = ['short', 'season', 'long', 'endless'].includes(options.storyLengthMode)
    ? options.storyLengthMode
    : null
  const productMode = chosenMode || fusionProductModeFor(a, b)
  const sourceA = publicConfigFor(a.config, protagonistName(a.config, '旅者甲'))
  const sourceB = publicConfigFor(b.config, protagonistName(b.config, '旅者乙'))
  const leadConfig = lead === 'b' ? sourceB : sourceA
  const genreA = genreFor(a.genreId || a.config.genreId)
  const genreB = genreFor(b.genreId || b.config.genreId)
  const mergedConfig = {
    ...leadConfig,
    genreId: leadConfig.genreId,
    // The product mode is pinned here — the reader's explicit choice
    // when one was made, else the combination table — never inherited
    // from whichever source happened to lead: a fused line is born
    // running (never pre-finished, never carrying a custom target).
    storyLengthMode: productMode,
    targetChapters: null,
    finishedAt: '',
    name: `${sourceA.name} × ${sourceB.name}`,
    trait: `${sourceA.trait} / ${sourceB.trait}`,
    origin: `${sourceA.origin} & ${sourceB.origin}`,
    ability: `${sourceA.ability} + ${sourceB.ability}`,
    tone: leadConfig.tone,
    immersive: false,
    hometown: '',
    role: '',
    friend: '',
    destination: `${genreA.location} ↔ ${genreB.location}`,
    step: 1,
    protagonists: [
      { name: sourceA.name, trait: sourceA.trait, origin: sourceA.origin, ability: sourceA.ability, genreId: sourceA.genreId, avatarId: sourceA.avatarId || '', appearance: sourceA.avatarAppearance || '' },
      { name: sourceB.name, trait: sourceB.trait, origin: sourceB.origin, ability: sourceB.ability, genreId: sourceB.genreId, avatarId: sourceB.avatarId || '', appearance: sourceB.avatarAppearance || '' },
    ],
    sourceGenres: [genreA.id, genreB.id],
    merge: { rules, lead, bond },
  }
  const timestamp = now()
  // The fused line is named from the two BOOKS it came from, not from
  // their genre templates (FINAL-FIX, fusion item): the old
  // 「合流：<题材> × <题材>」 put the template's sample name on the
  // cover, so two fusions of same-genre lines — and a fusion next to
  // its own sources on the shelf — were indistinguishable. The book
  // titles are the identity; each side is clipped so the pair stays
  // one cover line, and when both sources share one title the pair is
  // told apart by their leads instead. Where each half came from
  // stays on the record regardless (sourceTitles, below).
  const clipSide = (text) => {
    const value = String(text || '').trim()
    return value.length > 12 ? `${value.slice(0, 12)}…` : value
  }
  const sourceTitleA = typeof a.title === 'string' ? a.title.trim() : ''
  const sourceTitleB = typeof b.title === 'string' ? b.title.trim() : ''
  const mergedTitle = sourceTitleA && sourceTitleB && sourceTitleA !== sourceTitleB
    ? `合流：${clipSide(sourceTitleA)} × ${clipSide(sourceTitleB)}`
    : `合流：${clipSide(sourceA.name) || '一位主角'} × ${clipSide(sourceB.name) || '另一位主角'}`
  const story = {
    id: makeId('merge'),
    title: mergedTitle,
    genreId: mergedConfig.genreId,
    config: mergedConfig,
    worldBible: {
      premise: `${worldNameOf(genreA, a.config)}与${worldNameOf(genreB, b.config)}在一处新的合流点相遇，两位主角必须共同定义边界。`,
      rules: rules === 'bridge'
        ? ['两种世界规则可以互相翻译，但每次翻译都会消耗稳定度。', '双主角共同见证合流点的每一次扰动，任何一方都不能被静默抹去。', '合流后的新规则必须被两位主角共同见证。']
        : ['两种世界规则保持各自边界，只在合流点短暂交叠。', '双主角可以同行，但不能替对方决定原世界的命运。', '任何跨界行动都必须留下可追溯的回声。'],
      // A finite fusion closes: its anchor is the decision the pair
      // owes the future. An endless fusion has no finale to anchor to —
      // the anchor is the open road itself: arcs settle one by one, and
      // both source lines' unrecovered foreshadowing stays on this
      // line's books until it finds its resolution here.
      endingAnchor: productMode === 'endless'
        ? '这条融合线没有预设的终点：每一弧结清一笔账，两位主角再一起决定下一弧往哪走；两条原线未回收的伏笔，都要在这条线上逐步有着落。'
        : bond === 'rivals' ? '两位主角必须决定竞争是否值得牺牲共同的未来。' : '两位主角必须决定要把共同的未来交给哪一种规则。',
      // The bespoke six-beat outline is the short shape; longer finite
      // fusions and endless ones take the genre outline at their own
      // total, like an ordinary forge of the same mode.
      outline: productMode === 'short'
        ? [
          '两条世界线在合流点相撞，双主角同时收到信号。',
          '他们决定暂时同行，第一条共同规则浮现。',
          '新的敌人从旧世界的缝隙里出现。',
          '规则冲突逼迫双主角选择翻译或分离。',
          '合流点坍缩，他们为未来保留一条路。',
          '两个世界找到共同呼吸，新的故事开始。',
        ]
        : outlineFor(genreFor(mergedConfig.genreId), mergedConfig),
    },
    chapterIndex: 0,
    chapters: [],
    choices: {},
    revision: 0,
    kind: 'merged',
    sourceIds: [a.id, b.id],
    // 来源标注 (FUSION2): where this line came from, kept on the story
    // itself so the settings book, the shelf and (via the snapshot) the
    // plaza can say 「由《A》×《B》融合而来」 without re-resolving the
    // sources — which may since have been renamed or deleted.
    derivedFrom: [a.id, b.id],
    sourceTitles: [cleanText(a.title, '未命名故事'), cleanText(b.title, '未命名故事')],
    author: '我',
    createdAt: timestamp,
    updatedAt: timestamp,
    bookmarked: false,
  }
  return story
}

// This only removes known literal values. A model may infer or paraphrase
// personal facts, so an AI share still needs a human review of every chapter.
const snapshotRedactor = (sourceConfig, safeConfig) => {
  const replacements = new Map()
  const add = (value, alias) => {
    if (typeof value !== 'string' || !value.trim()) return
    if (!replacements.has(value)) replacements.set(value, alias)
    const trimmed = value.trim()
    if (!replacements.has(trimmed)) replacements.set(trimmed, alias)
  }
  const visit = (source, target, field = '') => {
    if (typeof source === 'string') {
      if (field === 'genreId' || field === 'sourceGenres') return
      const aliases = {
        hometown: '某地', school: '某所学校', company: '某个组织', role: '某种职业',
        friend: '一位故人', destination: '某处目的地', protagonist: target?.name || safeConfig.name,
      }
      add(source, typeof target === 'string' && target ? target : aliases[field] || '已隐去的设定')
      return
    }
    if (Array.isArray(source)) {
      source.forEach((item, index) => visit(item, target?.[index], field))
      return
    }
    if (!source || typeof source !== 'object') return
    for (const [key, value] of Object.entries(source)) {
      // World genres and the three merge enums are public controlled values.
      if (key === 'genreId' || key === 'sourceGenres' || key === 'merge') continue
      // The book title is redacted as a whole from story.title (private
      // literals inside it are scrubbed by the OTHER fields' mappings —
      // the protagonist's name above all). Pairing the config's bookTitle
      // copy with an alias would make the title scrub itself.
      if (key === 'bookTitle') continue
      // The lorebook never reaches a snapshot at all (the snapshot config
      // strips it), and its trigger keys are short everyday words — folding
      // them into the literal redactor would mangle published prose.
      // Absence is structural, not scrubbed.
      if (key === 'lorebook') continue
      visit(value, target?.[key], key)
    }
  }
  visit(sourceConfig, safeConfig)
  const keys = [...replacements.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b))
  const escaped = keys.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = escaped.length ? new RegExp(escaped.join('|'), 'g') : null
  // One pass prevents an inserted alias from being interpreted as another
  // source value. Longest matches win when a person's name prefixes another.
  return value => typeof value === 'string' && pattern
    ? value.replace(pattern, match => replacements.get(match))
    : typeof value === 'string' ? value : ''
}

const snapshotChoice = (story, safe, index, redact) => {
  const expected = legacyChoiceAt(safe, index)
  if (!expected) return null
  const supplied = story.chapters[index]?.choice
  return {
    prompt: typeof supplied?.prompt === 'string' ? redact(supplied.prompt) : expected.prompt,
    options: expected.options.map(fallback => {
      const option = supplied?.options?.find(item => item?.id === fallback.id)
      return {
        id: fallback.id,
        label: typeof option?.label === 'string' ? redact(option.label) : fallback.label,
        detail: typeof option?.detail === 'string' ? redact(option.detail) : fallback.detail,
        consequence: typeof option?.consequence === 'string' ? redact(option.consequence) : fallback.consequence,
      }
    }),
  }
}

export function publicSnapshot(story) {
  validateStory(story)
  const sourceGenre = genreFor(story.genreId || story.config.genreId)
  const total = totalChaptersFor(story)
  // Backups can carry arbitrary extra fields. Build the public object from an
  // explicit schema instead of copying hidden prompts, model responses or PII.
  const safe = {
    id: `public-${hash(story.id)}`,
    genreId: sourceGenre.id,
    kind: story.kind === 'merged' ? 'merged' : 'solo',
    sourceIds: [],
    revision: Number.isInteger(story.revision) && story.revision >= 0 ? story.revision : 0,
    chapterIndex: Math.min(story.chapters.length, total - 1),
    chapters: [],
    choices: {},
    author: '我 · 本地分享',
    bookmarked: false,
    readOnly: true,
    readerIndex: 0,
    status: story.chapters.length >= total ? 'complete' : 'ongoing',
  }
  // 自己写 (WRITE-MODE §50): a hand-written book's local share copy is
  // the author's own prose verbatim — there is no avatar privacy to
  // redact and no scaffold may be substituted for the real chapters
  // (the generic path below would rebuild them from the local scene
  // machine). The title stays the author's real title.
  if (isManualStory(story)) {
    safe.creationMode = 'manual'
    safe.engine = 'manual'
    safe.title = story.title
    safe.config = {
      genreId: CUSTOM_GENRE_ID,
      storyLengthMode: 'endless',
      manualShelfId: typeof story.config?.manualShelfId === 'string' ? story.config.manualShelfId : '',
      tags: manualTagsOf(story),
    }
    safe.worldBible = {
      premise: typeof story.synopsis === 'string' ? story.synopsis : (story.worldBible?.premise || ''),
      rules: [],
      endingAnchor: '',
      outline: [],
    }
    safe.chapters = story.chapters.map((chapter, index) => ({
      id: `${safe.id}:chapter:${index}:manual`,
      index,
      title: chapter.title,
      paragraphs: (Array.isArray(chapter.paragraphs) ? chapter.paragraphs : []).filter((paragraph) => typeof paragraph === 'string'),
      summary: '',
      choice: null,
      events: [],
      foreshadowing: [],
    }))
    safe.status = isManuallyFinished(story) ? 'complete' : 'ongoing'
    return safe
  }
  if (story.engine === 'gemini') safe.engine = 'gemini'
  if (story.kind === 'merged') {
    safe.config = {
      ...redactedSnapshotConfig(story.config, '旅者甲 × 旅者乙'),
      name: '旅者甲 × 旅者乙',
      protagonists: [
        { name: '旅者甲', trait: '匿名探索者', origin: '未知世界', ability: '未命名火种', genreId: genreFor(story.config.protagonists?.[0]?.genreId || sourceGenre.id).id },
        { name: '旅者乙', trait: '匿名探索者', origin: '未知世界', ability: '未命名火种', genreId: genreFor(story.config.protagonists?.[1]?.genreId || sourceGenre.id).id },
      ],
      destination: '',
      merge: {
        rules: story.config.merge?.rules === 'separate' ? 'separate' : 'bridge',
        lead: story.config.merge?.lead === 'b' ? 'b' : 'a',
        bond: story.config.merge?.bond === 'rivals' ? 'rivals' : 'allies',
      },
      sourceGenres: [0, 1].map(index => genreFor(story.config.protagonists?.[index]?.genreId || sourceGenre.id).id),
    }
    safe.title = '合流：两条匿名世界线'
    safe.worldBible = {
      premise: '两条匿名世界线在一处新的合流点相遇，两位旅者共同定义边界。',
      rules: story.config.merge?.rules === 'separate'
        ? ['两种世界规则保持各自边界，只在合流点短暂交叠。', '双主角可以同行，但不能替对方决定原世界的命运。', '跨界行动必须留下可追溯的回声。']
        : ['两种世界规则可以互相翻译，但每次翻译都会消耗稳定度。', '双主角共同见证合流点的每一次扰动。', '新规则必须被两位旅者共同见证。'],
      endingAnchor: '两位匿名旅者为未来保留一条可以继续选择的路。',
      outline: ['两条匿名世界线相撞。', '旅者暂时同行。', '共同规则浮现。', '规则冲突升级。', '合流点坍缩。', '新的宇宙开始呼吸。'],
    }
  } else {
    safe.config = redactedSnapshotConfig(story.config, '匿名旅者')
    safe.title = `${sourceGenre.title} · 匿名旅者`
    safe.worldBible = worldBibleFor(sourceGenre, safe.config)
  }
  for (const [index, chapter] of story.chapters.entries()) {
    if (chapter?.index !== index || index >= total) throw new TypeError('cannot share non-sequential chapters')
    const selected = validChoiceAt(story, index)
    if (selected) safe.choices[index] = selected
  }
  if (story.engine === 'gemini') {
    const redact = snapshotRedactor(story.config, safe.config)
    safe.title = redact(story.title) || safe.title
    safe.chapters = story.chapters.map((chapter, index) => ({
      id: `${safe.id}:chapter:${index}:r${safe.revision}`,
      index,
      title: redact(chapter.title),
      paragraphs: chapter.paragraphs.map(redact),
      summary: redact(chapter.summary),
      choice: snapshotChoice(story, safe, index, redact),
      events: (Array.isArray(chapter.events) ? chapter.events : []).map(redact),
      foreshadowing: (Array.isArray(chapter.foreshadowing) ? chapter.foreshadowing : []).map(redact),
    }))
  } else {
    safe.chapters = story.chapters.map(chapter => buildChapter(safe, chapter.index))
  }
  return safe
}

/*
 * 广场 (plaza) snapshot: the public copy of a finished avatar line.
 *
 * BOOK-FACE-FIX (owner order 2026-10-30, 「不准搞这种脱敏」): the text
 * of this copy is the author's ORIGINAL text — title, synopsis, world
 * bible and chapter prose are carried verbatim, with no literal-value
 * replacement pass. Replacement redaction used to rewrite prose that
 * quoted the author's own config values into 「已隐去的设定」/「匿名
 * 火种」 placeholders and mangled published sentences; that machinery
 * is off this path entirely (it survives only in publicSnapshot, the
 * LOCAL share copy above, whose anonymity is that surface's design).
 * What the snapshot still withholds is structural, never textual:
 * internal identifiers (the source story's id, avatar ids) have no
 * field here, and the snapshot CONFIG is the entrant template shape
 * (redactedSnapshotConfig) — the fields an entrant must choose for
 * themselves (their avatar, identity, spawn point, ability) start
 * blank rather than inheriting the author's.
 *
 * The payload carries what the plaza's two consumptions need: the
 * full original line (chapters + the choices the author actually
 * took), a beat skeleton (per-chapter ledger events) for the detail
 * page, and an enterable world template.
 */
/**
 * The public form of a story's CURRENT title (TITLE-FLOW): since
 * BOOK-FACE-FIX the published title is the title itself, verbatim —
 * the plaza service mirrors a rename onto the stored publication with
 * this, and no replacement table is consulted. (The export keeps its
 * historical name and signature so existing callers do not move.)
 */
export function redactedTitleFor(story, safeConfig) {
  return typeof story?.title === 'string' ? story.title : ''
}

export function plazaSnapshot(story, { avatarName = '' } = {}) {
  validateStory(story)
  // A fused line in endless mode publishes exactly like any other
  // endless line — living while it runs, finished once its owner ends
  // it by hand (FUSION2). A FINITE fused line (short / season / long /
  // custom) publishes once it is complete (owner ruling 2026-10-30,
  // superseding the FUSION2 never-publish rule for finished lines); an
  // unfinished one is refused here just as the gate refuses it.
  const mergedLine = story.kind === 'merged'
  if (mergedLine && storyLengthModeOf(story) !== 'endless' && !isStoryComplete(story)) {
    throw new TypeError('合流故事还没走完，不能发布到广场')
  }
  const genre = genreFor(story.genreId || story.config.genreId)
  const mode = storyLengthModeOf(story)
  // The payload's chapter total is always a real count: a finite line's
  // design total, or — for an endless line, running or finished — the
  // chapters it has actually reached (its living count).
  const total = Number.isFinite(totalChaptersFor(story)) ? totalChaptersFor(story) : story.chapters.length
  // A running endless line publishes as a LIVING publication: serialising,
  // its content following the line as new chapters land. Everything else
  // on the plaza is a finished line.
  const lineStatus = mode === 'endless' && !isManuallyFinished(story) ? 'serializing' : 'finished'
  const displayName = cleanBounded(avatarName, 40) || '匿名旅者'
  const safeConfig = { ...redactedSnapshotConfig(story.config, displayName), name: displayName }
  if (mergedLine) {
    // The fused line is NOT anonymous either: both leads keep their real
    // names, traits, origins and abilities (BOOK-FACE-FIX: replacement
    // redaction on the publish path is abolished — published text is the
    // original text). Only structural identifiers stay home: avatar ids
    // and appearances are not fields of this record at all. The source
    // titles ride along (verbatim) so the detail page can label the
    // line 「由《A》×《B》融合而来」.
    const protagonists = [0, 1].map((index) => {
      const person = story.config.protagonists?.[index] || {}
      return {
        name: cleanText(person.name, index === 0 ? '旅者甲' : '旅者乙'),
        trait: typeof person.trait === 'string' ? person.trait : '',
        origin: typeof person.origin === 'string' ? person.origin : '',
        ability: typeof person.ability === 'string' ? person.ability : '',
        genreId: genreFor(person.genreId || story.genreId).id,
      }
    })
    safeConfig.name = protagonists.map((person) => person.name).join(' × ')
    safeConfig.protagonists = protagonists
    safeConfig.merge = {
      rules: story.config.merge?.rules === 'separate' ? 'separate' : 'bridge',
      lead: story.config.merge?.lead === 'b' ? 'b' : 'a',
      bond: story.config.merge?.bond === 'rivals' ? 'rivals' : 'allies',
    }
    safeConfig.sourceGenres = protagonists.map((person) => person.genreId)
  }
  const genreTemplateId = genreTemplateById(story.genreTemplateId)?.id
    || genreTemplateById(story.config?.genreTemplateId)?.id
    || ''
  const bibleSource = story.worldBible && typeof story.worldBible === 'object'
    ? story.worldBible
    : worldBibleFor(genre, safeConfig)
  // BOOK-FACE-FIX (owner order 2026-10-30): replacement redaction is
  // abolished on the publish path. Snapshot prose — title, synopsis,
  // bible, chapter text — is the author's original text, byte for byte;
  // nothing is rewritten into 「已隐去」/「匿名」 placeholders (that
  // machinery survives only in publicSnapshot, the LOCAL share copy,
  // which is a different surface with its own anonymity design). What
  // still stays home is structural, not textual: internal ids, the
  // source story id and avatar ids simply have no field here.
  const verbatim = (value) => (typeof value === 'string' ? value : '')
  // The fused line's public provenance: the two source titles, verbatim
  // like every other string in the snapshot (a source title quoting a
  // private literal is scrubbed the same way).
  const sourceTitles = mergedLine
    ? (Array.isArray(story.sourceTitles) ? story.sourceTitles : []).map((title) => verbatim(title)).filter(Boolean)
    : []
  if (mergedLine && safeConfig.merge) safeConfig.merge.sourceTitles = sourceTitles
  const worldBible = {
    premise: verbatim(bibleSource.premise),
    rules: (Array.isArray(bibleSource.rules) ? bibleSource.rules : []).map(verbatim),
    endingAnchor: verbatim(bibleSource.endingAnchor),
    outline: (Array.isArray(bibleSource.outline) ? bibleSource.outline : []).map(verbatim),
  }
  const safeShell = {
    id: `plaza-${hash(story.id)}`,
    genreId: genre.id,
    kind: mergedLine ? 'merged' : 'solo',
    config: safeConfig,
    worldBible,
    chapters: story.chapters,
    choices: story.choices || {},
    revision: Number.isInteger(story.revision) && story.revision >= 0 ? story.revision : 0,
  }
  const choices = {}
  for (let index = 0; index < story.chapters.length; index += 1) {
    const selected = validChoiceAt(story, index)
    if (selected) choices[index] = selected
  }
  safeShell.choices = choices
  let chapters
  if (story.engine === 'gemini') {
    chapters = story.chapters.map((chapter, index) => ({
      id: `${safeShell.id}:chapter:${index}:r${safeShell.revision}`,
      index,
      title: verbatim(chapter.title),
      paragraphs: (Array.isArray(chapter.paragraphs) ? chapter.paragraphs : []).map(verbatim),
      summary: verbatim(chapter.summary),
      choice: snapshotChoice(story, safeShell, index, verbatim),
      events: (Array.isArray(chapter.events) ? chapter.events : []).map(verbatim),
      foreshadowing: (Array.isArray(chapter.foreshadowing) ? chapter.foreshadowing : []).map(verbatim),
    }))
  } else {
    chapters = story.chapters.map((chapter) => buildChapter(safeShell, chapter.index))
  }
  const ledger = storyLedgerFor(story)
  const eventsByChapter = new Map()
  for (const event of ledger.events) {
    const list = eventsByChapter.get(event.chapter) || []
    list.push(verbatim(event.text))
    eventsByChapter.set(event.chapter, list)
  }
  const beats = chapters.map((chapter, index) => ({
    chapter: index + 1,
    title: chapter.title || '',
    summary: chapter.summary || '',
    events: eventsByChapter.get(index + 1) || [],
  }))
  return {
    title: verbatim(story.title),
    // The owner's blurb rides the snapshot (verbatim like every other
    // string) so a re-publish can refresh the plaza detail's 简介；
    // absent when the owner never wrote one — the detail then falls
    // back to the premise, as it did before the field existed.
    ...(typeof story.synopsis === 'string' && story.synopsis.trim() ? { synopsis: verbatim(story.synopsis) } : {}),
    genreId: genre.id,
    genreTemplateId,
    worldName: worldNameOf(genre, safeConfig),
    storyLengthMode: mode,
    seasonNumber: Number.isInteger(safeConfig.seasonNumber) ? safeConfig.seasonNumber : 1,
    totalChapters: total,
    lineStatus,
    ...(mergedLine ? { merged: true, sourceTitles } : {}),
    ...(story.engine === 'gemini' ? { engine: 'gemini' } : {}),
    config: safeConfig,
    worldBible,
    chapters,
    choices,
    beats,
    enterTemplate: {
      config: {
        genreId: genre.id,
        genreTemplateId,
        storyLengthMode: mode,
        targetChapters: safeConfig.targetChapters ?? null,
        seasonNumber: Number.isInteger(safeConfig.seasonNumber) ? safeConfig.seasonNumber : 1,
        customWorldName: safeConfig.customWorldName || '',
        customWorldSetting: safeConfig.customWorldSetting || '',
      },
      worldBible,
    },
  }
}

const advanceDemo = (story, count, branchIds = {}) => {
  let current = story
  for (let index = 0; index < count; index += 1) {
    const chapter = buildChapter(current, index)
    const accepted = acceptChapter(current, chapter, chapterKey(current, index))
    if (accepted === current) throw new Error(`could not materialize demo chapter ${index}`)
    current = accepted
    if (chapter.choice && index < count - 1) {
      current = chooseBranch(current, index, branchIds[index] || chapter.choice.options[0].id)
    }
  }
  return current
}

const withDemoMeta = (story, meta) => {
  const next = { ...story, ...meta, isDemo: true }
  // Demo IDs are stable, so their chapter IDs must be rebased with them. This
  // keeps the fixture usable by the same accept/key protocol as a new story.
  if (meta.id && meta.id !== story.id) {
    next.chapters = story.chapters.map((chapter) => ({
      ...chapter,
      id: `${meta.id}:chapter:${chapter.index}:r${story.revision}`,
    }))
  }
  return next
}

const demoMist = withDemoMeta(advanceDemo(createStory({
  genreId: 'mist', name: '遥', trait: '冷静观察者', origin: '无名漂泊者', ability: '听见潮汐', tone: '诗性冒险', immersive: false, destination: '白潮港',
}), 3, { 1: 'open' }), { id: 'demo-mist', title: '白潮港的第七次钟声', status: 'ongoing', author: '阿遥' })

const demoNeon = withDemoMeta(advanceDemo(createStory({
  genreId: 'neon', name: 'Echo', trait: '危险好奇心', origin: '失忆的继承人', ability: '读取备份', tone: '悬疑推进', immersive: false, destination: '下城回收站',
}), 6, { 1: 'wait', 3: 'cross' }), { id: 'demo-neon', title: '雨幕里的备用人格', status: 'complete', author: 'Echo-404' })

export const FRIEND_BOOK = withDemoMeta(advanceDemo(createStory({
  genreId: 'cultivation', name: '烬野', trait: '嘴硬心软', origin: '被放逐的学徒', ability: '借火一瞬', tone: '群像治愈', immersive: false, destination: '后山灵田',
}), 3, { 1: 'open' }), { id: 'demo-friend-cultivation', title: '火种越过九重天', status: 'ongoing', author: '烬野' })

const demoMerged = withDemoMeta(createMergedStory(demoMist, FRIEND_BOOK, { rules: 'bridge', lead: 'a', bond: 'allies' }), {
  id: 'demo-merged',
  title: '潮汐与火种：无昼之境',
  status: 'complete',
  author: '阿遥 × 烬野',
})

// These are local, read-only fixtures for the bookstore UI. They intentionally
// contain no popularity counters: a real service should supply those from data.
export const COMMUNITY_BOOKS = [demoMist, demoNeon, advanceDemo(demoMerged, 6, { 1: 'join', 3: 'bridge' })]
COMMUNITY_BOOKS[2] = withDemoMeta(COMMUNITY_BOOKS[2], { id: 'demo-merged', title: '潮汐与火种：无昼之境', status: 'complete', author: '阿遥 × 烬野' })
