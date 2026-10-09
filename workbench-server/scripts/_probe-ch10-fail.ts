/**
 * 复现 ch10 hard-reject：用终端失败稿 + 库内大纲/上章尾
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FAILED_CONTENT = `卯时的光刚透进窗纸，秦默就醒了。

掌心那块玄铁令牌正往外吐热气，烫得他一个激灵坐起身。令牌表面浮起一层暗红的光，像烧红的铁片。他披上外袍推门出去，风卷着尘土扑到脸上。

领主府前的广场上黑压压站满了人——不对，是站满了兵。

甲胄的冷光从府门一直铺到三里外的土坡，旌旗在晨风里猎猎作响，一眼望不到头。十万铁骑无声无息地立在晨曦里，连马匹都安静得像铁铸的。

秦默攥着令牌，指尖轻轻发麻。数过，今天正好第四十日，签到的兵卒累计十万整。这数字他夜里算过好几遍，可真当十万个人齐刷刷站在面前，那股子压迫感还是让他后颈发紧。

广场前头，赵铁柱带着三百旧部跪在阵前。

赵铁柱的伤还没好利索，胸口缠着的绷带在甲片下鼓出一块，可他腰杆挺得笔直，见秦默出来，重重磕了个头：“少主，旧部三百人，请少主检阅！”

身后那三百人跟着伏下身去，甲片碰出一片哗啦的响。

可秦默扫过去，看见几个人的肩膀是僵的，头低着，眼睛却往两边瞟。秦默没急着应声。他站在台阶上，目光从赵铁柱身上移开，落到旧部人群里。

秦德东站在第三排，一身灰袍，脸上挂着笑，那笑没到眼底。

旁边围着七八个老兵，甲都没穿齐整，腰里却都别着刀。秦默又看了一眼赵铁柱。赵铁柱跪在那儿，头还低着，可那只按在刀柄上的手，指节泛着白。

知道赵铁柱在等什么。这三百旧部里，有一半是秦德东的人，从昨天夜里就串通了。赵铁柱把这些人带到检阅场上，是想让秦默当众把这颗钉子拔了。

秦默把令牌收进怀里，往前走了两步，站到台阶边缘。

十万铁骑的目光齐刷刷落在他身上，像一片铁幕压下来。

“都起来吧。”秦默抬了抬手，声音不高，却压过了风。赵铁柱率先站起来，三百旧部跟着起身，甲片哗啦一阵响。

秦默的目光没停，从那些低垂的头脸上一一扫过，最后定在秦德东身上。

秦德东也正看他，嘴角还挂着那点笑，手却不着痕迹地往腰后探一下。秦默没点破，只把视线收回来，看向广场两侧。

十万铁骑分列得整整齐齐，刀枪如林，旌旗猎猎，连马匹都纹丝不动。他深吸一口气，正要开口，人群外忽然传来一阵马蹄声。

一骑快马从土坡那边冲过来，马背上的人滚鞍落地，跪在广场边上，声音又急又哑：“领主大人！镇妖司的沈大人到了，说是巡查妖祸，要见您！”

秦默眉头微动。镇妖司，燕山关那边的人，跟他这黑风岭八竿子打不着。

这时候上门，说是巡查妖祸，谁知道是来探虚实的还是来踩盘子的。正要说话，秦德东先开了口，嗓门不小：“哟，镇妖司的大人都惊动了？少主，你这排场摆得够大啊。”

他笑着往秦默这边凑了半步，声音压低了些，却正好让前排几个旧部听见，“只怕人家沈大人眼里，你这十万兵，不是兵，是祸。”

这话一出，前排几个老兵肩膀又僵了分。秦默没接茬，只对那斥候道：“请沈大人过来。”

斥候应声翻身上马，蹄声远去。片刻工夫，一队人马从土坡后转出来，当先一人骑着一匹青骢马，披着件玄色斗篷，兜帽压得低低的，只露出一截白皙的下巴。

到了广场边，那人翻身下马，斗篷一掀，露出一张年轻的面孔，眉眼清冷，腰间挂着一枚铜牌，上面铸着“镇妖”二字。

沈青鸾。秦默在记忆里翻出这个名字，燕山关镇妖司北境分司的巡查使，据说修为已到凝气后期，是镇妖司里头1号难缠的人物。

沈青鸾没急着开口，目光先扫过广场。十万铁骑列阵在前，旌旗蔽日，她眼底掠过一丝异色，很快又压下去，只浅浅道：“秦领主好大的手笔。黑风岭贫瘠之地，竟养得起十万兵马？”

“沈大人说笑了。”

秦默迎上前两步，拱手一礼，“这些兵卒，是朝廷拨给黑风岭的戍边之军，昨日刚到。黑风岭北接苍狼原，妖祸频发，没点人守着，怎么对得起朝廷的信任？”沈青鸾看了他一眼，没接话。

身后的随从牵马退到一旁，她自个儿却往前走了步，站到秦默身侧，声音压得只有两人能听见：“秦领主，我今日来，不为妖祸。”

秦默心里一紧，面上不动声色：“沈大人这话，秦某听不明白。”

“你听不明白，有人明白。”

沈青鸾的目光越过秦默，落在旧部人群里的秦德东身上，停了瞬，“我出燕山关前，有人托我带句话——黑风岭的税银，拖了三年，朝廷那边，已经有人递了折子。”

她说完这句，又退开一步，声音恢复正常：“秦领主，你忙你的。我就在旁边看看，不碍事。”

秦默心里那根弦绷得更紧了。税银的事他早就知道，原主就是被这笔烂账压垮的。

可沈青鸾这时候提出来，分明是有人想借镇妖司的手，探他的底。不动声色地看了一眼秦德东，秦德东正低着头，看不清表情，可那只手，又往腰后探一下。秦默收回目光，重新站到台阶边缘。

清了清嗓子，声音压过风声，传遍整个广场：“黑风岭的兄弟们，我秦默接任领主，到今天正好四十天。”

“四十天前，黑风岭是什么样，你们比谁都清楚，荒田千亩，水渠断流，账上欠着朝廷三年的税银，连一口干净水都喝不上。”

他顿了顿，目光扫过三百旧部：“这四十天，水坝修了，水渠通了，铁器打了，黑风寨的土匪也平了。我知道有人不服我，觉得我一个毛头小子，凭什么坐这个位子。”

“我不跟你们讲大道理。”

秦默抬手，指向广场上那十万铁骑，“这些兵，是朝廷拨来的戍边之军，从今日起，就驻在黑风岭。谁要是觉得我秦默坐不稳这个位子，可以站出来，当面跟我比划比划。”广场上静了瞬。十万铁骑纹丝不动，连马都不打一个响鼻。

旧部人群里，几个老兵的头低得更深了，可秦德东那七八个亲信，腰里的刀却略往外挪了挪。秦德东腰里的刀往外挪了那一下，秦默看得清清楚楚。没动，只把目光从旧部人群里收回来，落在赵铁柱身上。

赵铁柱站在三百旧部最前头，胸口那道伤还裹着绷带，血渍洇透了布条，可他腰杆挺得笔直，一只手按在刀柄上，眼睛一直没离开秦德东那帮人。

秦默冲他稍稍点了下头。赵铁柱像是得了令，往前迈了步，单膝跪地，刀鞘往地上一拄，声音粗得像砂石：“秦领主，赵铁柱这条命是你从黑风寨捡回来的。今天当着十万大军的面，我赵铁柱把话撂这儿——谁要动你，先问问我手里这把刀。”

身后那三百旧部，呼啦啦跪下去一片。秦德东那七八个亲信没跪。他们站在原地，腰里的刀往外又挪了寸。

秦默看着这一幕，心里那根弦绷到了极致。

他知道赵铁柱这一跪是真心，可他也清楚，秦德东那帮人今天不是来听训话的。刚想开口，人群里忽然响起一声冷笑。

“赵铁柱，你跪得倒快。”秦德东终于站了出来。拨开身前两个老兵，一步步走到广场中央，站在秦默和十万铁骑之间。

他指着秦默的鼻子，声音拔得老高：“你个冒牌货，也配坐这领主位？我秦家百年基业，岂容你一个外人败坏！”

身后那七八个亲信齐刷刷拔刀，刀尖直指秦默。

广场上哗然一片。几个老兵下意识往后缩，赵铁柱却噌地站起来，刀已经出了鞘半截。秦默伸手按住他的胳膊，自己往前踏了一步。

“二叔，”秦默的声音不高，却压住了整片嘈杂，“你说我是冒牌货，那你呢？”

从怀里掏出一沓泛黄的纸，抬手一扬，纸片散了地。最上面那封，信封上还盖着黑风寨的寨印。

“你通匪的证据，我早在10日前就拿到了。”

秦默低头看一眼地上的纸，又抬起眼皮，“铁器、箭簇、赈灾粮，每月一批，账上记得清清楚楚。你拿黑风岭的东西喂土匪，再拿土匪的银子填自己的腰包——二叔，这百年基业，是你先卖的吧？”秦德东脸色变了。他盯着地上那封信，嘴唇动了动，半天没说出一个字。

秦默没给他缓神的机会。抬手一挥，十万铁骑齐刷刷踏前一步，马蹄声和甲叶碰撞声汇成一声闷雷，震得广场上的尘土都跳了起来。

跟着，十万道声音同时炸开：“喝——”声浪卷过山野，连领主府屋檐上的瓦片都嗡嗡作响。

秦德东那七八个亲信的刀尖抖一下。他们回头瞅了瞅身后，十万铁骑黑压压一片，刀枪如林，别说冲过去，连退路都被封死了。

赵铁柱已经拔刀护在秦默身前，刀尖直指秦德东：“秦德东，你还有什么话说！”

秦德东的腮帮子抖了抖，忽然一把推开身前的人，冲着那七八个亲信吼道：“还愣着干什么！一个外人，凭什么骑在咱们秦家头上！跟我上，拿下他，黑风岭还是咱们的！”那七八个人犹豫了瞬，还是咬着牙举刀往前冲。

秦默没退。站在原地，看着那几把刀离自己越来越近，直到赵铁柱和十几个老兵迎上去，刀枪撞在一起，迸出几串火星子。秦德东趁乱往后退，想往人群里钻。

“拿下他。”

秦默的声音从乱局里传出来，不轻不重。
`

async function main() {
  const { default: mysql } = await import('mysql2/promise')
  const url = process.env.DATABASE_URL || ''
  if (!url) throw new Error('DATABASE_URL missing')
  const conn = await mysql.createConnection(url)

  const [eps] = await conn.query<any[]>(
    `SELECT episode_number, title, description, content,
            CHAR_LENGTH(COALESCE(content,'')) AS content_len
     FROM episodes WHERE drama_id=37 AND episode_number IN (9,10)
     ORDER BY episode_number`,
  )
  const ep9 = eps.find((e: any) => e.episode_number === 9)
  const ep10 = eps.find((e: any) => e.episode_number === 10)
  if (!ep9 || !ep10) throw new Error('missing ep9/ep10')

  const outline = String(ep10.description || '')
  const prevTail = String(ep9.content || '').slice(-1200)
  const content = FAILED_CONTENT

  console.log('=== DB state ===')
  console.log({
    ep9_len: ep9.content_len,
    ep10_len: ep10.content_len,
    ep10_title: ep10.title,
    prev_tail_len: prevTail.length,
    fail_chars: content.replace(/\s/g, '').length,
  })
  console.log('prevTail head/tail:', prevTail.slice(0, 80).replace(/\s+/g, ' '), '...', prevTail.slice(-120).replace(/\s+/g, ' '))

  const {
    outlineInfoDeltaCovered,
    extractOutlineInfoDelta,
    splitInfoDeltaPointsForCover,
    infoDeltaPointCovered,
  } = await import('../src/services/novel/novel-outline-beat-cover.js')
  const { detectOutlineCompliance } = await import('../src/services/novel/novel-outline-compliance.js')
  const { detectChapterSeamColdOpen } = await import('../src/services/novel/novel-chapter-seam.js')

  const delta = extractOutlineInfoDelta(outline)
  const points = splitInfoDeltaPointsForCover(delta)
  console.log('\n=== info_delta points ===')
  console.log('delta:', delta)
  console.log('points:', points)
  console.log('covered?', outlineInfoDeltaCovered(content, outline))
  for (const p of points) {
    console.log(' point', infoDeltaPointCovered(content, p), '←', p)
  }

  const cold = detectChapterSeamColdOpen({
    content,
    chapterNumber: 10,
    prevChapterTail: prevTail,
    chapterOutline: outline,
  })
  console.log('\n=== coldOpen (rule) ===')
  console.log(cold)

  // opening vs prev: 沈青鸾 already present?
  const opening = content.slice(0, 800)
  console.log('\n=== rewind signals ===')
  console.log({
    open_has_wake: /醒了|透进窗纸|推门出去/.test(opening),
    open_shen_arrive: /沈大人到了|沈青鸾/.test(content.slice(0, 2000)),
    prev_has_shen: /沈青鸾/.test(prevTail),
    prev_has_arrive: /翻身下马|迎出去|镇妖司/.test(prevTail),
    content_has_tuoba: /拓跋烈/.test(content),
    content_has_countdown: /反噬|倒计时|一年/.test(content),
    content_has_gui_xin: /归心|跪下去一片/.test(content),
    content_has_song_dong: /态度松动|神色复杂|眼底掠过一丝异色/.test(content),
  })

  const report = detectOutlineCompliance({
    content,
    chapterOutline: outline,
    chapterNumber: 10,
    prevChapterTail: prevTail,
  })
  console.log('\n=== compliance (rule path) ===')
  console.log({
    ok: report.ok,
    codes: report.reasons.map(r => r.code),
    messages: report.reasons.map(r => r.message.slice(0, 120)),
  })

  // Also try with terminal's prev tail excerpt (from audit prompt) if DB ep9 differs
  const termPrevPath = resolve(process.cwd(), 'scripts/_ch10-prev-from-term.txt')
  // inline terminal prev from 2.txt lines 108-146
  const termPrev = `黑风岭领主府的议事厅里，还飘着昨儿夜里那股子土腥气。

渠沟修通了，水顺着渠底流下去了，可人身上沾的泥还没干透。秦默刚把湿透的袍角拧了两把，外头就传来一阵马蹄声，密得像砸在瓦上的冰雹。

周文远从门外进来，青布袍上沾着渠边的泥点，脸色却不太好看：“领主，镇妖司的人来了，打着‘妖祸蔓延’的旗号，说要接管黑风岭防务。”

秦默手里的湿袍子放下，抬眼：“来了多少人？” “一队斩妖人，领头的是北境统领沈青鸾。”

周文远压低声音，“筑基后期。”秦默没接话，只把案上那几本账册往旁边挪了挪。筑基后期，在这北境贫瘠之地，算得上一尊人物了。

他掌心那块玄铁令牌凉丝丝地贴着皮肉，像块烧不透的冰。

外头马蹄声已经进了院子。秦默整了整衣领，迎出去。沈青鸾翻身下马的时候，秦默正好站在台阶上。

那女人一身玄色劲装，腰悬长剑，眉眼锋利得像刀裁出来的，扫过来的眼神带着审视的冷意，从头到脚把他量了一遍。

“秦领主。”

她声音不紧不慢，却压得人心里发沉。身后那队斩妖人已经下马，齐刷刷立在院中，甲胄上沾着荒原的风沙，刀鞘口露着半截寒光。

“黑风虎逃了。”沈青鸾走到台阶下，没有上来的意思，目光平视着他，“它投了妖域十二洞，黑风老妖放话要吞北境。这风声，你该知道轻重。”

秦默没接这话，只侧身让了半步：“沈统领远来辛苦，先进屋喝口热茶。”

沈青鸾没动，她身后的斩妖人也没动，像一排插在土里的铁桩子。

“茶不急喝。”

她声音不大，却清清楚楚，“镇妖司奉旨协防北境，黑风岭是第一道口子。秦领主，你的兵、你的粮、你的账，从今日起都要过我的手。”院里的风忽然停了。赵铁柱不知什么时候从偏院赶了过来，胸口的伤还裹着布条，脸色青白，却站得笔直。

听见这话，喉结动了动，拳头攥紧又松开，终究没敢出声——他淬体后期的修为，在沈青鸾面前跟纸糊的没两样。

秦默倒是不慌。他袖口还沾着水渠边蹭的泥，站在台阶上，比沈青鸾高了半个头，却半点气势不压人，只笑了笑：“沈统领要看账，尽管看。黑风岭穷得叮当响，每一粒粮、每一把刀都有来路。”

回头朝屋里喊声：“周先生，把账册和屯田图都搬出来。”周文远应声进去，片刻工夫，抱着一摞牛皮封面的账本出来，码在廊下的石阶上。

秦默弯腰拿起最上面一本，拍了拍灰，递到沈青鸾面前：“这是去年秋税的底账，朝廷催了三回，还欠着两百四十两。沈统领要是能替黑风岭把这窟窿填上，秦某求之不得。”`

  const coldTerm = detectChapterSeamColdOpen({
    content,
    chapterNumber: 10,
    prevChapterTail: termPrev.slice(-1200),
    chapterOutline: outline,
  })
  console.log('\n=== coldOpen vs terminal prevTail ===')
  console.log(coldTerm)

  const reportTerm = detectOutlineCompliance({
    content,
    chapterOutline: outline,
    chapterNumber: 10,
    prevChapterTail: termPrev.slice(-1200),
  })
  console.log('\n=== compliance vs terminal prevTail ===')
  console.log({
    ok: reportTerm.ok,
    codes: reportTerm.reasons.map(r => r.code),
    messages: reportTerm.reasons.map(r => r.message.slice(0, 140)),
  })

  // detail: why point 2 fails
  const p2 = '秦德东通匪证据曝光，旧部彻底归心'
  const h = content.replace(/\s+/g, '')
  console.log('\n=== point2 detail ===', {
    isResult: (await import('../src/services/novel/novel-outline-beat-cover.js')).isInfoDeltaResultStatePoint(p2),
    has曝光: h.includes('曝光'),
    has揭穿: h.includes('揭穿'),
    has拿到了: h.includes('拿到了'),
    has归心: h.includes('归心'),
    has跪: h.includes('跪下去'),
    coveredAlone: infoDeltaPointCovered(content, p2),
    coveredIf曝光: infoDeltaPointCovered(content + '证据曝光。', p2),
  })

  void termPrevPath
  await conn.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
