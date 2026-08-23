// Climbing vocabulary used for keyword matching, learning-value scoring and
// glossary cards. Extends the original 30-word keyword bank to cover the
// vocabulary a climber actually needs at an overseas gym or World Cup.

export const CLIMBING_TERMS = [
  // Competition format
  ['boulder', '抱石线路', 'This boulder is low percentage.'],
  ['lead', '难度/先锋攀', 'The lead final starts at eight.'],
  ['speed', '速度赛', 'She races speed tomorrow.'],
  ['flash', '一把完攀(无预习)', 'A flash changes the scoreboard.'],
  ['top', '完攀点/顶点', 'She is close to the top.'],
  ['topped', '完攀了', 'She topped this boulder.'],
  ['zone', 'Zone 得分点', 'The zone can still matter.'],
  ['attempt', '尝试/次数', 'She has time for another attempt.'],
  ['appeal', '申诉', 'The team can appeal the decision.'],
  ['confirmed', '确认有效', 'The top was confirmed.'],
  ['scoreboard', '记分牌', 'Watch the scoreboard on the left.'],
  ['isolation', '隔离区', 'Athletes wait in isolation.'],
  ['qualification', '资格赛', 'She came through qualification easily.'],
  ['semi-final', '半决赛', 'The semi-final round was brutal.'],
  ['final', '决赛', 'The final is stacked this year.'],
  ['clock', '计时钟', 'The clock is still running.'],
  ['countdown', '倒计时', 'Ten seconds on the countdown.'],
  ['route setter', '定线员', 'The route setter intended a jump.'],
  ['setting', '定线', 'The setting rewards creativity.'],
  ['beta', '动作解法/攻略', 'He found smarter beta.'],

  // Holds and wall features
  ['hold', '岩点/手点', 'That hold is difficult to use.'],
  ['crimp', '小边/扣点', 'She holds the crimp carefully.'],
  ['sloper', '圆支点/斜面点', 'That sloper is hard to trust.'],
  ['jug', '大把手点', 'Rest on the jug before the crux.'],
  ['pinch', '捏点', 'The pinch requires thumb strength.'],
  ['pocket', '指洞点', 'She two-finger pockets up.'],
  ['undercling', '反抠点', 'She moves into the undercling.'],
  ['sidepull', '侧拉点', 'The sidepull sets up the cross.'],
  ['gaston', '反推点', 'A gaston opens the sequence.'],
  ['volume', '大体积岩点', 'The volume changes the body position.'],
  ['arete', '岩棱', 'She wraps the arete.'],
  ['slab', '偏平衡的板壁', 'The slab rewards balance and patience.'],
  ['overhang', '仰角/屋檐壁', 'The overhang is steep.'],
  ['roof', '大屋檐', 'The roof section is powerful.'],
  ['crack', '裂缝', 'She jams the crack.'],
  ['foothold', '脚点', 'The foothold is glassy.'],
  ['chip', '小碎点', 'Only a chip for the left foot.'],

  // Movement and technique
  ['move', '动作', 'That move requires commitment.'],
  ['sequence', '动作序列', 'This final sequence is delicate.'],
  ['dyno', '动态跳跃', 'She sticks the dyno.'],
  ['mantle', '撑起/翻上去', 'She has to mantle over the volume.'],
  ['match', '双手并点', 'She needs to make the match.'],
  ['cross', '交叉手', 'The cross-through is the key.'],
  ['flag', '平衡摆腿', 'A flag keeps her hips in.'],
  ['drop knee', '压膝/落膝', 'The drop knee locks her in.'],
  ['heel hook', '脚跟钩', 'The heel hook saves energy.'],
  ['heel', '脚跟技术/脚跟挂点', 'She keeps trusting the heel.'],
  ['toe hook', '脚尖钩', 'The toe hook holds the swing.'],
  ['bicycle', '对踩(heel/toe 夹点)', 'A bicycle clamps the hold.'],
  ['campus', '不用脚的纯上肢攀爬', 'He campuses through the roof.'],
  ['smear', '踩墙/抹点', 'She smears on the wall.'],
  ['footwork', '脚法', 'Her footwork is silent.'],
  ['foot', '脚点/踩点', 'The right foot is important here.'],
  ['toe', '脚尖', 'She needs to point her toe.'],
  ['kneebar', '膝杠休息', 'A kneebar gives a hands-off rest.'],
  ['lock off', '锁定', 'She locks off the next move.'],
  ['deadpoint', '死点发力', 'A deadpoint to the lip.'],
  ['coordination', '协调发力', 'A coordination jump opens the boulder.'],
  ['run and jump', '助跑跳跃', 'A run and jump starts the final.'],
  ['paddle', '划手发力', 'She paddles through the coordination move.'],

  // Body and condition
  ['flexibility', '柔韧性', 'That move requires flexibility.'],
  ['balance', '平衡', 'Balance decides this slab.'],
  ['tension', '身体张力', 'Keep the tension through the core.'],
  ['core', '核心', 'The core keeps her feet on.'],
  ['shoulder', '肩部', 'That move loads the shoulder.'],
  ['pumped', '前臂酸胀/泵感', 'Her arms are pumped.'],
  ['reach', '臂展/伸手够点', 'She reaches over to the next hold.'],
  ['height', '身高', 'Height matters on this move.'],

  // Commentary judgment words
  ['commit', '果断投入动作', 'She has to commit to the move.'],
  ['committed', '果断投入', 'She fully committed to the jump.'],
  ['cruising', '做得很顺', 'She is cruising through the lower section.'],
  ['tenuous', '很不稳/很微妙', 'It is such a tenuous move.'],
  ['delicate', '细腻/微妙', 'A delicate foot swap.'],
  ['powerful', '爆发力强', 'A powerful jump to the finish.'],
  ['low percentage', '成功率低', 'This is a low percentage boulder.'],
  ['high percentage', '成功率高', 'The jug is a high percentage move.'],
  ['crux', '难点/关键段', 'This is the crux of the boulder.'],
  ['slipped', '滑掉', 'She slipped after the match.'],
  ['peeled off', '从墙上剥落掉落', 'She peeled off near the top.'],
  ['fall', '掉落', 'That was the first fall.'],
  ['stuck', '粘住/稳稳接住', 'She stuck the move perfectly.'],
  ['swing', '摆荡', 'The swing almost pulled her off.'],
  ['wobble', '晃动/不稳', 'There was a bit of a wobble.'],
  ['fight for it', '费力完成', 'She had to fight for that move.'],
  ['gutted', '非常失落', 'She looked gutted after the fall.'],
  ['stoked', '超兴奋', 'She is stoked with the top.'],
  ['comfortable', '游刃有余', 'She looks comfortable on the slab.'],
  ['patient', '耐心', 'She stays patient on the balance moves.'],
];

export const CLIMBING_TERM_MAP = new Map(
  CLIMBING_TERMS.map(([term, zh, example]) => [term, { term, zh, example }])
);

export const STOPWORDS = new Set(
  `a an the and or but so if then than that this these those there here it its it's is are was were be been being
   do does did done have has had having i you he she we they them his her their our your my me him us
   of to in on at for with about into over under again further once from by as at
   what which who whom when where why how all any both each few more most other some such
   not no nor only own same too very can will just should would could may might must shall
   now get got go goes going come comes came take takes took make makes made see saw seen look looks looking
   yeah yes nope ok okay oh ah uh um hmm wow well right left`
    .split(/\s+/)
    .filter(Boolean)
);

export const FILLER_WORDS = new Set(
  `yeah yes yep nope ok okay oh ah uh um uh-huh hmm wow whoa well right like literally actually basically
   hey ho come c'mon go goes going woo yeees ha haha`
    .split(/\s+/)
    .filter(Boolean)
);

export const GRAMMAR_SIGNALS =
  /\b(because|although|though|unless|until|since|while|whereas|if|when|whenever|so that|in case|even though|despite|compared to|better|worse|easier|harder|stronger|smarter|more|less|most|least|would have|could have|should have|has to|have to|had|been|being)\b/i;

export function findClimbingTerms(text) {
  const lower = ` ${text.toLowerCase()} `;
  const hits = [];
  for (const [term] of CLIMBING_TERMS) {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lower)) hits.push(term);
  }
  return hits;
}

export function keywordsForText(text, limit = 4) {
  const hits = findClimbingTerms(text)
    .map((term) => CLIMBING_TERM_MAP.get(term))
    .filter(Boolean)
    .slice(0, limit);

  if (hits.length > 0) return hits;

  return [
    {
      term: 'commentary',
      zh: '比赛解说',
      example: 'Listen for the main action in the commentary.',
    },
    {
      term: 'attempt',
      zh: '尝试',
      example: 'Describe what happened in this attempt.',
    },
  ];
}
