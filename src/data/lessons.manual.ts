import type { Lesson } from '../types';

export const innsbruckLessons: Lesson[] = [
  {
    "id": "innsbruck-2026-mb-day-1",
    "title": "Day 1: 欢迎来到 Innsbruck 决赛",
    "sourceUrl": "https://www.youtube.com/watch?v=LJFxLkPn_Vc",
    "sourceLabel": "Men's Boulder final | Innsbruck 2026",
    "mediaUrl": "youtube:LJFxLkPn_Vc",
    "mediaStartTime": 0,
    "videoId": "LJFxLkPn_Vc",
    "competition": "IFSC World Cup Innsbruck 2026",
    "discipline": "Men's Boulder Final",
    "athlete": "Matt Groom / Sorato Anraku",
    "startTime": 24,
    "endTime": 320,
    "segmentGoal": "听懂主持人开场介绍、天气状况、赛季日历，以及八位决赛选手的快速预热。",
    "captionStatus": "基于 YouTube 官方英文自动字幕（ASR），时间轴与中文翻译已经手工校对。",
    "sentences": [
      {
        "id": "s01",
        "label": "Welcome to Innsbruck",
        "startTime": 24,
        "endTime": 80,
        "transcript": "Hello and welcome to Insburgh. We are here for the World Climbing Series and it is time for the men's final. The temperature has dropped a little bit, but it is still over twenty-eight degrees and thirty-seven percent humidity out there. So it is a sticky one, but conditions will be improving as we go.",
        "zhTranslation": "大家好，欢迎来到因斯布鲁克。我们来到了世界攀岩系列赛，男子决赛时刻到了。气温小幅下降，但室外仍然超过 28 度、湿度 37%。所以非常潮湿黏手，不过情况会越来越好。",
        "zhExplanation": "sticky = 又湿又黏（形容天气和手感）；'improving as we go' 表示随着比赛推进、体温升高，会越来越顺手。",
        "keywords": [
          {
            "term": "welcome to",
            "zh": "欢迎来到",
            "example": "Welcome to the World Climbing Series."
          },
          {
            "term": "sticky",
            "zh": "黏手/潮湿",
            "example": "In this heat the rubber is not as sticky."
          },
          {
            "term": "humidity",
            "zh": "湿度",
            "example": "Thirty-seven percent humidity out there."
          }
        ],
        "sentencePatterns": [
          "We are here for the World Climbing Series.",
          "conditions will be improving as we go"
        ],
        "speakingPrompt": "Say one short welcome sentence to open a climbing event."
      },
      {
        "id": "s02",
        "label": "Meet the commentators",
        "startTime": 80,
        "endTime": 160,
        "transcript": "My name is Matt Groom and it is a pleasure to be joined once again by Sophia Yokiyama. How you doing, Sophia? It was wonderful. I had a great day watching semis this morning, and then had some fun doing Judy Fuja's hair in the afternoon.",
        "zhTranslation": "我叫 Matt Groom，很高兴再次请到 Sophia Yokiyama 来搭档。Sophia，你怎么样？我过得很好。今早看了半决赛很爽，下午还给 Judy Fuja 做了个头发。",
        "zhExplanation": "commentator = 解说员；'it is a pleasure to be joined by' 是赛事解说的标准介绍语；'how you doing' 比较口语。",
        "keywords": [
          {
            "term": "a pleasure to be joined by",
            "zh": "很高兴请到",
            "example": "It is a pleasure to be joined by Sophia."
          },
          {
            "term": "commentator",
            "zh": "解说员",
            "example": "The commentator breaks down every move."
          },
          {
            "term": "semis",
            "zh": "半决赛",
            "example": "We watched the semis this morning."
          }
        ],
        "sentencePatterns": [
          "it is a pleasure to be joined by",
          "I had a great day watching..."
        ],
        "speakingPrompt": "Introduce your co-host using 'a pleasure to be joined by'."
      },
      {
        "id": "s03",
        "label": "Commentating full time",
        "startTime": 160,
        "endTime": 210,
        "transcript": "I unfortunately injured myself sometime after Bern, and I have decided to quit comp climbing and commentate forever. No, I am not actually quitting, but it has been fun.",
        "zhTranslation": "伯尔尼站之后我很不幸受了伤，所以我决定放弃比赛、全职做解说。开个玩笑，我其实没真退，但玩得很开心。",
        "zhExplanation": "'quit comp climbing' 退赛；'commentate forever' 永远做解说。括号的玩笑是现场感强的口头互动。",
        "keywords": [
          {
            "term": "quit comp climbing",
            "zh": "退出比赛攀岩",
            "example": "She quit comp climbing after the injury."
          },
          {
            "term": "commentate",
            "zh": "做解说",
            "example": "He will commentate the final tomorrow."
          }
        ],
        "sentencePatterns": [
          "I have decided to quit...",
          "I am not actually quitting, but..."
        ],
        "speakingPrompt": "Joke about a sudden career change."
      },
      {
        "id": "s04",
        "label": "The man to beat",
        "startTime": 210,
        "endTime": 240,
        "transcript": "Four out of four for him. A step above everyone else. And he is the man to beat. Going for a historic five out of five. Sorato, crazy. If he gets six, he will equal Janja's amazing clean streak from a couple of years ago.",
        "zhTranslation": "他 4 战 4 胜，比所有人都高一档。他是这次要被打败的人。冲击史无前例的 5 连冠。Sorato 太疯狂了。如果拿下 6 连冠，他就会追平 Janja 两年前那个惊人的连胜纪录。",
        "zhExplanation": "'the man to beat' 所有人都想击败的那个人；'clean streak' 完美连胜（不输一场）；'historic five out of five' 史无前例的 5 战全胜。",
        "keywords": [
          {
            "term": "the man to beat",
            "zh": "所有挑战者都要击败的人",
            "example": "Anraku is the man to beat this season."
          },
          {
            "term": "clean streak",
            "zh": "完美连胜",
            "example": "She is on a six-event clean streak."
          },
          {
            "term": "historic",
            "zh": "史无前例的",
            "example": "A historic five out of five."
          }
        ],
        "sentencePatterns": [
          "He is the man to beat.",
          "If he gets six, he will equal Janja's streak."
        ],
        "speakingPrompt": "Describe Anraku's season in two sentences."
      },
      {
        "id": "s05",
        "label": "Calendar and venues",
        "startTime": 150,
        "endTime": 195,
        "transcript": "In July, we go to Krakow in about a week's time for speed. In September, we return to China. And then October, we finish things off with Salt Lake City, Santiago, and Gungan in Korea.",
        "zhTranslation": "七月一周后我们要去克拉科夫的速攀赛；九月回中国；十月我们用盐湖城、圣地亚哥、韩国光州收官。",
        "zhExplanation": "speed 是速攀（Speed climbing）项目；'finish things off' 完美收官。注意各站地点的英文发音。",
        "keywords": [
          {
            "term": "in about a week's time",
            "zh": "大约一周后",
            "example": "In about a week's time we go to Krakow."
          },
          {
            "term": "finish things off",
            "zh": "完美收官",
            "example": "We will finish things off in October."
          },
          {
            "term": "speed",
            "zh": "速攀",
            "example": "Speed climbing needs raw power."
          }
        ],
        "sentencePatterns": [
          "In July, we go to Krakow in about a week's time.",
          "We finish things off with..."
        ],
        "speakingPrompt": "List two upcoming World Cup stops."
      },
      {
        "id": "s06",
        "label": "Hannes van Duysen back",
        "startTime": 195,
        "endTime": 240,
        "transcript": "Hannes van Duysen is back in, having missed out just in the last couple of comps. And this lovely sort of lache into a cordo move at the top was a fun boulder to watch.",
        "zhTranslation": "Hannes van Duysen 回来了，前两站比赛他缺席了。这次他跳到顶部的 coordinacion 抓点动作非常好看，是一块很有趣的 boulder。",
        "zhExplanation": "lache = 动态抓握（法语借词）；'cordo' 即 coordinacion，指一套连续协调的抓点动作；'missed out' 错过了。",
        "keywords": [
          {
            "term": "missed out",
            "zh": "错过了/缺席",
            "example": "He missed out on the last two comps."
          },
          {
            "term": "lache",
            "zh": "动态抓握（法语）",
            "example": "A lache into the final hold was beautiful."
          }
        ],
        "sentencePatterns": [
          "He is back in, having missed out...",
          "That was a fun boulder to watch."
        ],
        "speakingPrompt": "Welcome back a returning athlete."
      },
      {
        "id": "s07",
        "label": "Leokan headbutts the wall",
        "startTime": 240,
        "endTime": 270,
        "transcript": "Leokan is also back in. He went through the cord moves nicely and definitely headbutted the wall. We have it on a replay.",
        "zhTranslation": "Leokan 也回到了决赛。他顺利通过那套协调抓点动作，还一头撞上了墙面（头槌墙）。我们有回放。",
        "zhExplanation": "headbutt 头槌/头撞墙——是抱石里失手后身体前倾、头磕墙的搞笑瞬间；'cord moves' 协调动作。",
        "keywords": [
          {
            "term": "headbutted the wall",
            "zh": "一头撞墙（失手）",
            "example": "She headbutted the wall after the dynamic move."
          },
          {
            "term": "replay",
            "zh": "回放",
            "example": "We have it on a replay."
          }
        ],
        "sentencePatterns": [
          "He went through the cord moves nicely.",
          "He definitely headbutted the wall."
        ],
        "speakingPrompt": "Describe a fun fail moment in climbing."
      },
      {
        "id": "s08",
        "label": "Max Mill sets a record",
        "startTime": 270,
        "endTime": 320,
        "transcript": "Max Mill, lovely to see him in a final — his second this year. And he equals a British record by getting in here. So it is great stuff from him. His seventh World Cup Boulder final, which is a male record.",
        "zhTranslation": "Max Mill 看到他进决赛很欣慰——今年第二次了。他这次追平了英国纪录。这成绩太牛了。这已经是他第 7 次站上 World Cup 抱石决赛，是男子纪录。",
        "zhExplanation": "equals a British record 追平英国纪录；'seventh World Cup Boulder final' 第 7 次参加 World Cup 抱石决赛。",
        "keywords": [
          {
            "term": "equals a record",
            "zh": "追平纪录",
            "example": "He equals a British record today."
          },
          {
            "term": "World Cup final",
            "zh": "世界杯决赛",
            "example": "His seventh World Cup Boulder final."
          }
        ],
        "sentencePatterns": [
          "Lovely to see him in a final.",
          "He equals a British record by getting in here."
        ],
        "speakingPrompt": "Congratulate an athlete for reaching a final."
      }
    ]
  },
  {
    "id": "innsbruck-2026-mb-day-2",
    "title": "Day 2: 半决赛：力量与协调",
    "sourceUrl": "https://www.youtube.com/watch?v=LJFxLkPn_Vc",
    "sourceLabel": "Men's Boulder final | Innsbruck 2026",
    "mediaUrl": "youtube:LJFxLkPn_Vc",
    "mediaStartTime": 0,
    "videoId": "LJFxLkPn_Vc",
    "competition": "IFSC World Cup Innsbruck 2026",
    "discipline": "Men's Boulder Final",
    "athlete": "Saut / Sam Avezou",
    "startTime": 1800,
    "endTime": 2100,
    "segmentGoal": "分辨 physical boulder 和 coordination boulder 的解说话术，听懂 rest, momentum, rock over, situational cheering 等关键表达。",
    "captionStatus": "基于 YouTube 官方英文自动字幕（ASR），时间轴与中文翻译已经手工校对。",
    "sentences": [
      {
        "id": "s01",
        "label": "Practically nothing on the volume",
        "startTime": 1800,
        "endTime": 1835,
        "transcript": "He is on the higher part of the volume, like he really just has it on the corner. He has less to push off than if your foot is a bit lower. You do also have a bit of the edge of the volume, but still it is like practically nothing.",
        "zhTranslation": "他脚踩在造型的上沿，基本上只踩到一个角。这样比把脚放低一点，可蹬的空间更小。边缘上虽然还有点可用面积，但也几乎等于没有。",
        "zhExplanation": "volume 造型（线路上的大块岩）；'push off' 借力蹬起；'practically nothing' 几乎等于没有。",
        "keywords": [
          {
            "term": "push off",
            "zh": "蹬起",
            "example": "He has less to push off."
          },
          {
            "term": "on the corner",
            "zh": "在棱角上",
            "example": "His foot is just on the corner."
          },
          {
            "term": "practically nothing",
            "zh": "几乎等于零",
            "example": "The edge is practically nothing."
          }
        ],
        "sentencePatterns": [
          "He has less to push off than if...",
          "It is like practically nothing."
        ],
        "speakingPrompt": "Describe a bad foot placement on a volume."
      },
      {
        "id": "s02",
        "label": "Rock over onto the pink foot",
        "startTime": 1835,
        "endTime": 1880,
        "transcript": "That worked really well. He aimed perfectly onto the pink and then with his momentum continued onto the black. He just needs to rock over his pink foot — the pink foot a bit more.",
        "zhTranslation": "这动作非常利落。他精确地落在了粉色把点上，再靠冲量顺势到黑色点上。他只要把粉脚再蹬过去一点——粉脚再多挪一些。",
        "zhExplanation": "aimed perfectly 精确瞄准；'momentum' 冲量/惯性；'rock over' 把重心从一只脚摇到另一只脚。",
        "keywords": [
          {
            "term": "momentum",
            "zh": "冲量/惯性",
            "example": "He used his momentum to reach the next hold."
          },
          {
            "term": "rock over",
            "zh": "把重心摇到",
            "example": "Rock over the pink foot and stand up."
          },
          {
            "term": "aimed perfectly",
            "zh": "精准瞄准",
            "example": "He aimed perfectly onto the pink."
          }
        ],
        "sentencePatterns": [
          "He aimed perfectly onto the pink.",
          "He just needs to rock over his pink foot."
        ],
        "speakingPrompt": "Tell a climber to commit to the next hold."
      },
      {
        "id": "s03",
        "label": "Less rest on slams",
        "startTime": 1880,
        "endTime": 1920,
        "transcript": "On slams you do not need to rest as much as I would say physical boulders. I mean obviously physical boulders or coordination boulders, like Sam — um, he does not look like he is going to get that anytime soon.",
        "zhTranslation": "动态（slam）动作选手不需要像力量 boulder 那样休息那么多。力量 boulder 或者协调 boulder（像 Sam 这块）的话，他看起来短时间内拿不下来。",
        "zhExplanation": "slam = 爆发力动作（法语借词）；'physical boulder' 力量型线路；'coordination boulder' 协调型线路。",
        "keywords": [
          {
            "term": "slam",
            "zh": "爆发力动作",
            "example": "On slams you do not need to rest as much."
          },
          {
            "term": "physical boulder",
            "zh": "力量型 boulder",
            "example": "This is a physical boulder."
          },
          {
            "term": "coordination boulder",
            "zh": "协调型 boulder",
            "example": "Coordination boulders need precise footwork."
          }
        ],
        "sentencePatterns": [
          "You do not need to rest as much as physical boulders.",
          "He does not look like he is going to get that anytime soon."
        ],
        "speakingPrompt": "Compare slam and physical boulders."
      },
      {
        "id": "s04",
        "label": "Body close to the wall",
        "startTime": 1920,
        "endTime": 1960,
        "transcript": "Sam did really well, but his body, his upper body, was a bit further out from the wall. And you definitely want to be closer in. Even maybe straight leg is rushing through the beginning of the boulder.",
        "zhTranslation": "Sam 这一把做得不错，但他的上身离墙有点远。你当然要尽量贴墙。还有点像直腿就把 boulder 开头给冲过去了。",
        "zhExplanation": "body close to the wall 身体贴墙（减少力矩）；'straight leg' 直腿（没用上膝盖弯曲借力）；'rushing through' 冲得太快。",
        "keywords": [
          {
            "term": "body close to the wall",
            "zh": "身体贴墙",
            "example": "Keep your body close to the wall."
          },
          {
            "term": "straight leg",
            "zh": "直腿",
            "example": "A straight leg wastes power."
          },
          {
            "term": "rushing through",
            "zh": "冲得太急",
            "example": "He is rushing through the bottom sequence."
          }
        ],
        "sentencePatterns": [
          "His body was a bit further out from the wall.",
          "You definitely want to be closer in."
        ],
        "speakingPrompt": "Tell a climber to keep the body close to the wall."
      },
      {
        "id": "s05",
        "label": "Every point is important",
        "startTime": 1960,
        "endTime": 2010,
        "transcript": "Sam just wants the zone, because like we said, every point is important. Unfortunately no top. So that is problematic, because as we know it is definitely climbable.",
        "zhTranslation": "Sam 只想要 zone，因为我们说过，每一分都很重要。遗憾没拿到 top。这就麻烦了，因为我们都知道这条线路肯定是能爬的。",
        "zhExplanation": "zone = 中间得分点的把手；'every point is important' 每一分都关键——'climbable' 可爬的。",
        "keywords": [
          {
            "term": "every point is important",
            "zh": "每一分都重要",
            "example": "Every point is important at this stage."
          },
          {
            "term": "climbable",
            "zh": "能爬的",
            "example": "It is definitely climbable."
          },
          {
            "term": "out of time",
            "zh": "超时",
            "example": "That was out of time unfortunately."
          }
        ],
        "sentencePatterns": [
          "Every point is important.",
          "It is definitely climbable."
        ],
        "speakingPrompt": "Explain why a small point still matters."
      },
      {
        "id": "s06",
        "label": "Situational cheering",
        "startTime": 2010,
        "endTime": 2050,
        "transcript": "I got a message from a coach just now who said we call the cheering we were talking about situational cheering. It is super important for the athlete — it gives you that bit more confidence in your method.",
        "zhTranslation": "我刚刚收到一位教练的消息，他把我们说的这种加油叫做 situational cheering（情景式加油）。这对运动员超级重要——让你对自己的方法多一分信心。",
        "zhExplanation": "situational cheering = 现场观众在关键点专门设计的加油助威；'confidence in your method' 相信自己的攀爬方法。",
        "keywords": [
          {
            "term": "situational cheering",
            "zh": "情景式加油",
            "example": "The crowd did situational cheering on the crux."
          },
          {
            "term": "confidence in your method",
            "zh": "对自己方法的信心",
            "example": "Cheering gives you confidence in your method."
          }
        ],
        "sentencePatterns": [
          "It gives you that bit more confidence in your method.",
          "It is super important for the athlete."
        ],
        "speakingPrompt": "Explain what situational cheering is."
      },
      {
        "id": "s07",
        "label": "Max is shorter, but the boulder does not care",
        "startTime": 2050,
        "endTime": 2080,
        "transcript": "Max is shorter than — or as it says on the statistics here, it said 166. So we will see how the slab turns out. Yeah, I am not sure how accurate that is, to be honest, but it is the data I have.",
        "zhTranslation": "Max 个子更矮——或者按这边的统计，166 cm。所以我们看看这块板壁他会怎么打。说实话我也不确定这数据准不准，但这就是我手头的数字。",
        "zhExplanation": "Max 身高 166cm 在决赛选手中偏矮；slab 板壁是接近垂直但角度平缓的岩面；'how the slab turns out' 这块板壁怎么走。",
        "keywords": [
          {
            "term": "shorter climber",
            "zh": "矮个选手",
            "example": "Shorter climbers fit inside the box better."
          },
          {
            "term": "slab",
            "zh": "板壁",
            "example": "This boulder is a slab."
          }
        ],
        "sentencePatterns": [
          "Max is shorter than...",
          "We will see how the slab turns out."
        ],
        "speakingPrompt": "Comment on a short climber's chances on a slab."
      },
      {
        "id": "s08",
        "label": "Changing shoes for a tiny jib",
        "startTime": 2080,
        "endTime": 2100,
        "transcript": "He is changing shoes. That right one is the new one. But he only changed his left, which is surprising because I would have thought he might have changed his right shoe, because it is like small jibs. But the right shoe is stiff already.",
        "zhTranslation": "他在换鞋。右脚是新款。但他只换了左脚，有点意外——我本来以为他会换右脚，因为这个线路有很多小挂片。不过右脚那双已经够硬了。",
        "zhExplanation": "stiff = 鞋底硬（适合踩小点）；jib 即小挂片（jib-like 突起的小型脚点）。",
        "keywords": [
          {
            "term": "stiff shoes",
            "zh": "硬底鞋",
            "example": "The right shoe is stiff already."
          },
          {
            "term": "small jibs",
            "zh": "小挂片",
            "example": "The line has small jibs all over."
          }
        ],
        "sentencePatterns": [
          "He is changing shoes.",
          "I would have thought he might have changed his right shoe."
        ],
        "speakingPrompt": "Talk about a climber's shoe choice for a line with small jibs."
      }
    ]
  },
  {
    "id": "innsbruck-2026-mb-day-3",
    "title": "Day 3: 决赛前夜，Saut 接近完攀",
    "sourceUrl": "https://www.youtube.com/watch?v=LJFxLkPn_Vc",
    "sourceLabel": "Men's Boulder final | Innsbruck 2026",
    "mediaUrl": "youtube:LJFxLkPn_Vc",
    "mediaStartTime": 0,
    "videoId": "LJFxLkPn_Vc",
    "competition": "IFSC World Cup Innsbruck 2026",
    "discipline": "Men's Boulder Final",
    "athlete": "Saut Amagasa / Sam Avezou",
    "startTime": 3000,
    "endTime": 3240,
    "segmentGoal": "听懂 Saut Amagasa 在决赛前一轮的临界表现、heel hook 的关键作用，以及 Sam Avezou 的 power boulder 教学。",
    "captionStatus": "基于 YouTube 官方英文自动字幕（ASR），时间轴与中文翻译已经手工校对。",
    "sentences": [
      {
        "id": "s01",
        "label": "Grip survived the slip",
        "startTime": 3000,
        "endTime": 3040,
        "transcript": "I think the grip survived. Yeah, if you could I mean it was also like kind of a surprising slip, but if you could not hold it one arm — I think they are not that great. Saut now tries, kind of a bit hesitant on his attempt here.",
        "zhTranslation": "我觉得那个把手的胶皮还在。是的，能抓——虽然那次滑脱挺突然的，但单手能抓——我觉得它们状态还行。Saut 现在开始尝试，他这一把有点犹豫。",
        "zhExplanation": "'grip survived' 把手的摩擦力还在；'hesitant' 犹豫不决——用于描述选手出手前的谨慎。",
        "keywords": [
          {
            "term": "grip survived",
            "zh": "把手的胶皮还在",
            "example": "The grip survived the heat."
          },
          {
            "term": "hesitant",
            "zh": "犹豫",
            "example": "He is a bit hesitant on this attempt."
          },
          {
            "term": "hold it one arm",
            "zh": "单手能抓",
            "example": "You cannot hold it one arm."
          }
        ],
        "sentencePatterns": [
          "I think the grip survived.",
          "He is a bit hesitant on his attempt here."
        ],
        "speakingPrompt": "Comment on a climber's hesitance before a send."
      },
      {
        "id": "s02",
        "label": "Pushing off from a stretched-out position",
        "startTime": 3040,
        "endTime": 3080,
        "transcript": "You have to push off quite a lot from that stretched-out position. And you want to be able to go a bit out and into the wall, so it brings you in and your upper body is in, and you can kind of stay onto the wall.",
        "zhTranslation": "你得从那个大幅伸展的姿势狠蹬一下。理想是先往外、再往里贴墙，把身体拉近，上身贴稳墙面，这样就能保持住。",
        "zhExplanation": "push off quite a lot 狠狠蹬；'stretched-out position' 身体大幅伸展；'out and into the wall' 先外后内贴墙。",
        "keywords": [
          {
            "term": "push off",
            "zh": "蹬起",
            "example": "Push off from that stretched-out position."
          },
          {
            "term": "stretched-out position",
            "zh": "大幅伸展的姿势",
            "example": "He is in a stretched-out position."
          }
        ],
        "sentencePatterns": [
          "You have to push off quite a lot.",
          "Bring your upper body into the wall."
        ],
        "speakingPrompt": "Coach a climber on body positioning."
      },
      {
        "id": "s03",
        "label": "Intended beta is the dynamic way",
        "startTime": 3080,
        "endTime": 3110,
        "transcript": "He misses the pink, but tries this dynamic way. I think that is the intended beta, and it worked out really well.",
        "zhTranslation": "他没抓稳粉点，但试了这种动态打法。我觉得这就是设计路线时想要的方案，而且效果出奇好。",
        "zhExplanation": "intented beta 路线设计者想要的攀爬方案；'dynamic way' 动态打法（vs 静态/力量打法）。",
        "keywords": [
          {
            "term": "intended beta",
            "zh": "设计路线时的方案",
            "example": "That is the intended beta by the setters."
          },
          {
            "term": "dynamic way",
            "zh": "动态打法",
            "example": "He tried the dynamic way."
          }
        ],
        "sentencePatterns": [
          "He misses the pink but tries this dynamic way.",
          "That is the intended beta."
        ],
        "speakingPrompt": "Explain what 'intended beta' means."
      },
      {
        "id": "s04",
        "label": "A power boulder for the home viewers",
        "startTime": 3110,
        "endTime": 3150,
        "transcript": "Sam goes again — a basic power boulder, which is interesting, and a lot of people at home you guys watching love a power boulder. So this is one for you.",
        "zhTranslation": "Sam 再次上墙——这是块基本的力量 boulder，挺有意思的，家里看直播的各位观众都爱看力量 boulder。这块就是给你们准备的。",
        "zhExplanation": "power boulder 力量 boulder（需要爆发力）；'a lot of people at home' 居家观众。",
        "keywords": [
          {
            "term": "power boulder",
            "zh": "力量 boulder",
            "example": "This is a basic power boulder."
          },
          {
            "term": "at home",
            "zh": "居家（观赛的）",
            "example": "A lot of people at home love a power boulder."
          }
        ],
        "sentencePatterns": [
          "This is one for you, the home viewers.",
          "Sam goes again on a power boulder."
        ],
        "speakingPrompt": "Set up a power boulder for the audience."
      },
      {
        "id": "s05",
        "label": "Heel hook takes weight off the hands",
        "startTime": 3150,
        "endTime": 3180,
        "transcript": "The heel will help that movement. It will take weight off his hands. And now he is going to want to hold this swing, so he is putting his whole arm onto the volume.",
        "zhTranslation": "脚跟钩（heel hook）会帮他做这个动作——能把手上的重量卸掉一些。现在他要稳住在这次摆动里，所以他整个前臂都压在了造型上。",
        "zhExplanation": "heel hook 脚跟钩（用脚后跟勾住支点）；'take weight off his hands' 把重量从手转移到脚。",
        "keywords": [
          {
            "term": "heel hook",
            "zh": "脚跟钩",
            "example": "A heel hook takes weight off the hands."
          },
          {
            "term": "swing",
            "zh": "摆动",
            "example": "He needs to hold this swing."
          }
        ],
        "sentencePatterns": [
          "The heel will help that movement.",
          "It will take weight off his hands."
        ],
        "speakingPrompt": "Explain why a heel hook helps on a swing."
      },
      {
        "id": "s06",
        "label": "Smart high heel hook",
        "startTime": 3180,
        "endTime": 3210,
        "transcript": "That was great work. His high heel hook was a very smart thing to do, because it definitely took weight off his left hand and then matching above also made it.",
        "zhTranslation": "这波做得很妙。他那个高脚跟钩很聪明——肯定把左手上的重量卸掉了，再加上上面那一步的并点，整套连下来了。",
        "zhExplanation": "high heel hook 高位脚跟钩（脚跟挂得很高）；'matching above' 上方并点。",
        "keywords": [
          {
            "term": "high heel hook",
            "zh": "高位脚跟钩",
            "example": "A high heel hook on the volume was key."
          },
          {
            "term": "matching above",
            "zh": "上方并点",
            "example": "Matching above set up the top."
          }
        ],
        "sentencePatterns": [
          "His high heel hook was a very smart thing to do.",
          "It definitely took weight off his left hand."
        ],
        "speakingPrompt": "Praise a smart heel hook."
      },
      {
        "id": "s07",
        "label": "So close to glory",
        "startTime": 3210,
        "endTime": 3240,
        "transcript": "Sautagasa springs over. Oh, that was so close, but he is only got thirty seconds left. He went from absolutely nothing to nearly glory there on that one. He went double into the last hold, but once again, just a bit not enough.",
        "zhTranslation": "Sautagasa 弹了过去。哎呀太接近了，但他只剩 30 秒。他这一把从完全没戏一路打到差点封神——双手都进到了最后那个把点，但还是差了一点点。",
        "zhExplanation": "spring over 弹跳过去；'from absolutely nothing to nearly glory' 从零到接近封神；'double into the last hold' 双手都进最后把手。",
        "keywords": [
          {
            "term": "springs over",
            "zh": "弹跳过去",
            "example": "Sautagasa springs over the slab."
          },
          {
            "term": "from nothing to nearly glory",
            "zh": "从零到接近封神",
            "example": "He went from nothing to nearly glory."
          },
          {
            "term": "double into",
            "zh": "双手都进（把点）",
            "example": "He went double into the last hold."
          }
        ],
        "sentencePatterns": [
          "He went from absolutely nothing to nearly glory.",
          "He went double into the last hold, but just a bit not enough."
        ],
        "speakingPrompt": "Comment on a near-miss send."
      }
    ]
  },
  {
    "id": "innsbruck-2026-mb-day-4",
    "title": "Day 4: M2 关键 zone，Ray 顶完",
    "sourceUrl": "https://www.youtube.com/watch?v=LJFxLkPn_Vc",
    "sourceLabel": "Men's Boulder final | Innsbruck 2026",
    "mediaUrl": "youtube:LJFxLkPn_Vc",
    "mediaStartTime": 0,
    "videoId": "LJFxLkPn_Vc",
    "competition": "IFSC World Cup Innsbruck 2026",
    "discipline": "Men's Boulder Final",
    "athlete": "Ray Kawamata / Hannes van Duysen",
    "startTime": 3600,
    "endTime": 3890,
    "segmentGoal": "听懂 brush holds、slab climbing、thumb、send 等关键解说话术，以及 Hannes van Duysen 顶完时的关键 zone 抉择。",
    "captionStatus": "基于 YouTube 官方英文自动字幕（ASR），时间轴与中文翻译已经手工校对。",
    "sentences": [
      {
        "id": "s01",
        "label": "Brush holds between goes",
        "startTime": 3600,
        "endTime": 3650,
        "transcript": "It is important to brush holds also in between goes, because you just get that extra pile of torque which takes away some friction. And all friction is important at this point.",
        "zhTranslation": "每次尝试之间刷一下把手也很重要——因为手汗和胶皮会越积越多，把摩擦力磨掉一些。现在这种温度下，每一分摩擦都关键。",
        "zhExplanation": "brush holds 用刷子刷把手（清理镁粉/汗渍）；'pile of torque' 一层油脂/汗垢；'takes away friction' 削弱摩擦。",
        "keywords": [
          {
            "term": "brush holds",
            "zh": "刷把手",
            "example": "The climber brushes holds between goes."
          },
          {
            "term": "takes away friction",
            "zh": "削弱摩擦力",
            "example": "Sweat takes away friction."
          }
        ],
        "sentencePatterns": [
          "It is important to brush holds in between goes.",
          "All friction is important at this point."
        ],
        "speakingPrompt": "Explain why brushing holds matters in the heat."
      },
      {
        "id": "s02",
        "label": "Slab climbing to get into the zone",
        "startTime": 3650,
        "endTime": 3680,
        "transcript": "Good slab climbing to get into that zone. That is important. He sits in fourth for the moment, thirty-four point seven. So in touch with everyone else, of course, he is a boulder behind.",
        "zhTranslation": "板壁爬上来到 zone 这一段做得不错，这点很关键。他现在暂时排在第 4，34.7 分。跟前面几位咬得很紧，不过 boulders 数还差一个。",
        "zhExplanation": "slab climbing 板壁爬法；'a boulder behind' 在 boulder 数上落后 1 个（按总分计）。",
        "keywords": [
          {
            "term": "slab climbing",
            "zh": "板壁爬法",
            "example": "Good slab climbing to get into that zone."
          },
          {
            "term": "a boulder behind",
            "zh": "落后一个 boulder",
            "example": "He is a boulder behind."
          }
        ],
        "sentencePatterns": [
          "Good slab climbing to get into that zone.",
          "He is a boulder behind."
        ],
        "speakingPrompt": "Comment on a climber's intermediate ranking."
      },
      {
        "id": "s03",
        "label": "This is a physical boulder",
        "startTime": 3680,
        "endTime": 3710,
        "transcript": "As time went down, this is a bit more. This is the physical boulder, so you are not going to be able to give as many attempts. You are going to have to rest properly.",
        "zhTranslation": "随着时间推进，这块越来越关键。这是块力量 boulder，所以你不可能给太多次尝试。你得好好休息才能再战。",
        "zhExplanation": "physical boulder 力量 boulder；'rest properly' 充分休息；'give as many attempts' 给出足够多的尝试。",
        "keywords": [
          {
            "term": "rest properly",
            "zh": "充分休息",
            "example": "You are going to have to rest properly."
          }
        ],
        "sentencePatterns": [
          "This is the physical boulder.",
          "You are not going to be able to give as many attempts."
        ],
        "speakingPrompt": "Explain why physical boulders demand more rest."
      },
      {
        "id": "s04",
        "label": "Adding the thumb",
        "startTime": 3710,
        "endTime": 3750,
        "transcript": "You have to match it. You are just adding the thumb. Adding the thumb adds that extra like strength. Yeah, bite into holding these tiny holds.",
        "zhTranslation": "你得先双脚并点。然后把大拇指也加上去。加了拇指就能多一分力——对，就是死咬住这些小把点。",
        "zhExplanation": "match it 双脚并点；'adding the thumb' 把拇指也搭上增加摩擦力；'bite into holding' 死咬住。",
        "keywords": [
          {
            "term": "add the thumb",
            "zh": "加上拇指",
            "example": "Adding the thumb adds that extra strength."
          },
          {
            "term": "bite into holding",
            "zh": "死咬住",
            "example": "Bite into holding these tiny holds."
          }
        ],
        "sentencePatterns": [
          "Adding the thumb adds that extra strength.",
          "Bite into holding these tiny holds."
        ],
        "speakingPrompt": "Coach a climber to use the thumb on a tiny crimp."
      },
      {
        "id": "s05",
        "label": "Climbing is almost ballet",
        "startTime": 3750,
        "endTime": 3780,
        "transcript": "Camera crew, it is like you are filming ballet. This is amazing. Honestly, climbing is almost — it is why I am such a good ballet, guys.",
        "zhTranslation": "摄影组，你们简直在拍芭蕾舞。太惊艳了。说真的，攀岩差不多就是——这大概是我舞跳得这么好的原因吧。",
        "zhExplanation": "'filming ballet' 形容选手动作流畅有美感；'almost' 加破折号留悬念。",
        "keywords": [
          {
            "term": "filming ballet",
            "zh": "拍芭蕾",
            "example": "It is like filming ballet."
          }
        ],
        "sentencePatterns": [
          "It is like you are filming ballet.",
          "Climbing is almost ballet."
        ],
        "speakingPrompt": "Describe smooth climbing as ballet."
      },
      {
        "id": "s06",
        "label": "Ray sticks the coordination",
        "startTime": 3780,
        "endTime": 3810,
        "transcript": "Ray sticks the coordination again. And he has got a minute, so he has got time here. Has a long look. He was far from it the first time, better the second.",
        "zhTranslation": "Ray 又把这套协调动作稳住了。他还有一分钟，所以时间够。他盯了好一会儿。头一把离 top 很远，这把比上次好很多。",
        "zhExplanation": "sticks the coordination 稳住这套协调动作；'has a long look' 长时间观察；'far from it' 离完攀还差很远。",
        "keywords": [
          {
            "term": "sticks the coordination",
            "zh": "稳住协调动作",
            "example": "He sticks the coordination again."
          },
          {
            "term": "has a long look",
            "zh": "长时间观察",
            "example": "He has a long look before committing."
          }
        ],
        "sentencePatterns": [
          "He has a long look.",
          "He was far from it the first time, better the second."
        ],
        "speakingPrompt": "Compare a climber's first and second attempts."
      },
      {
        "id": "s07",
        "label": "Hannes has 40 seconds on a physical boulder",
        "startTime": 3810,
        "endTime": 3850,
        "transcript": "Hannes has already jumped onto the wall. He definitely has enough time, but now he has forty seconds left on the clock. So once again, I think in physical boulders it is unfortunate to be like, okay, this is my last attempt.",
        "zhTranslation": "Hannes 已经上墙了。他时间其实够，但剩 40 秒了。再说一遍，我觉得力量 boulder 里最惨的就是这种——好，这就是我最后一次尝试。",
        "zhExplanation": "jumped onto the wall 跳上墙开始爬；'my last attempt' 我最后一次尝试。",
        "keywords": [
          {
            "term": "forty seconds left on the clock",
            "zh": "倒计时剩 40 秒",
            "example": "He has forty seconds left on the clock."
          },
          {
            "term": "last attempt",
            "zh": "最后一次尝试",
            "example": "Okay, this is my last attempt."
          }
        ],
        "sentencePatterns": [
          "He has forty seconds left on the clock.",
          "This is my last attempt."
        ],
        "speakingPrompt": "Set the scene for a last-attempt send."
      },
      {
        "id": "s08",
        "label": "Hannes manages the top",
        "startTime": 3850,
        "endTime": 3870,
        "transcript": "He is powering out from quite early on in that boulder. And then — oh my goodness, the first one. He managed to do it. That is so great. That is potentially massive for his score here.",
        "zhTranslation": "他在 boulder 早期就已经开始掉力了。然后——天哪，第一把。居然成了。太棒了。这对他的分数来说可能是巨大的提升。",
        "zhExplanation": "powering out 力量耗尽；'managed to do it' 居然做出来了；'potentially massive' 可能有巨大影响。",
        "keywords": [
          {
            "term": "powering out",
            "zh": "力量耗尽",
            "example": "He is powering out from quite early on."
          },
          {
            "term": "managed to do it",
            "zh": "居然做出来了",
            "example": "He managed to do it on the first try."
          }
        ],
        "sentencePatterns": [
          "He is powering out from quite early on.",
          "He managed to do it."
        ],
        "speakingPrompt": "React to a hard-won send."
      },
      {
        "id": "s09",
        "label": "Comfortably in the lead with two first tops",
        "startTime": 3870,
        "endTime": 3880,
        "transcript": "He is going to put himself comfortably in the lead with two first tops.",
        "zhTranslation": "两个一次性 top 让他轻松领跑全场。",
        "zhExplanation": "first top = first attempt top 一次性完攀（一次就 top）；'comfortably in the lead' 稳坐榜首。",
        "keywords": [
          {
            "term": "first top",
            "zh": "一次性完攀",
            "example": "Two first tops put him in the lead."
          },
          {
            "term": "comfortably in the lead",
            "zh": "稳稳领跑",
            "example": "He is comfortably in the lead."
          }
        ],
        "sentencePatterns": [
          "He is going to put himself comfortably in the lead.",
          "Two first tops is huge."
        ],
        "speakingPrompt": "Announce a leader after two flashes."
      },
      {
        "id": "s10",
        "label": "The perfect send",
        "startTime": 3880,
        "endTime": 3890,
        "transcript": "That is one of those like the smile before sending it is pretty cool. When you hype the crowd and then you send — that is like the most perfect send you can have in a comp.",
        "zhTranslation": "这就是经典的那种——完攀前先朝观众笑一下超酷的。你先把场子热起来，再把 boulder 推掉——这是比赛里最完美的一次完攀方式。",
        "zhExplanation": "send it 完攀（动词用法）；'hype the crowd' 把观众带热；'the most perfect send' 最完美的一次完攀。",
        "keywords": [
          {
            "term": "send",
            "zh": "完攀",
            "example": "He sent the boulder on his first try."
          },
          {
            "term": "hype the crowd",
            "zh": "把场子带热",
            "example": "Hype the crowd, then send."
          },
          {
            "term": "most perfect send",
            "zh": "最完美的完攀",
            "example": "That is the most perfect send in a comp."
          }
        ],
        "sentencePatterns": [
          "Hype the crowd and then you send.",
          "That is the most perfect send you can have in a comp."
        ],
        "speakingPrompt": "Describe a perfect competition send."
      }
    ]
  },
  {
    "id": "innsbruck-2026-mb-day-5",
    "title": "Day 5: Max M2 失误——物理 boulder 的艰难",
    "sourceUrl": "https://www.youtube.com/watch?v=LJFxLkPn_Vc",
    "sourceLabel": "Men's Boulder final | Innsbruck 2026",
    "mediaUrl": "youtube:LJFxLkPn_Vc",
    "mediaStartTime": 0,
    "videoId": "LJFxLkPn_Vc",
    "competition": "IFSC World Cup Innsbruck 2026",
    "discipline": "Men's Boulder Final",
    "athlete": "Max Milne",
    "startTime": 4800,
    "endTime": 5100,
    "segmentGoal": "听懂 hot rubber、crimp、jib、blind、screw holds、trust your feet、friction 等核心攀岩词汇在实战中的具体含义。",
    "captionStatus": "基于 YouTube 官方英文自动字幕（ASR），时间轴与中文翻译已经手工校对。",
    "sentences": [
      {
        "id": "s01",
        "label": "Hot rubber is not as sticky",
        "startTime": 4800,
        "endTime": 4840,
        "transcript": "We also have to keep in mind it is really hot. Rubber gets hot, so they are not as sticky on volumes. It is just like your hands. If your hands get hot, they are not as sticky.",
        "zhTranslation": "还得记住现在真的很热。橡胶鞋底一热，在造型上就不那么黏了。跟手是一个道理——手一出汗就不那么粘把点。",
        "zhExplanation": "rubber 攀岩鞋底（橡胶）；'not as sticky' 不那么黏；'get hot' 受热。",
        "keywords": [
          {
            "term": "rubber gets hot",
            "zh": "鞋底橡胶受热",
            "example": "Rubber gets hot and loses stickiness."
          },
          {
            "term": "sticky",
            "zh": "黏",
            "example": "The rubber is not as sticky on volumes."
          }
        ],
        "sentencePatterns": [
          "Rubber gets hot so they are not as sticky.",
          "It is just like your hands."
        ],
        "speakingPrompt": "Explain how heat affects climbing shoes."
      },
      {
        "id": "s02",
        "label": "Why warm shoes are not grippier",
        "startTime": 4840,
        "endTime": 4880,
        "transcript": "In a Formula 1 car, you need to warm up the tires and therefore they are grippier. Why do warm climbing shoes not provide more grip? That is a very good question. I mean, we will leave that in the air.",
        "zhTranslation": "F1 赛车需要热胎才有抓地力，那为什么攀岩鞋热了反而抓地力下降？好问题。这个我们就先搁着。",
        "zhExplanation": "warm up the tires 热胎；'leave that in the air' 暂时不讨论，留个悬念。",
        "keywords": [
          {
            "term": "leave that in the air",
            "zh": "暂不讨论",
            "example": "We will leave that in the air."
          }
        ],
        "sentencePatterns": [
          "Why do warm climbing shoes not provide more grip?",
          "We will leave that in the air."
        ],
        "speakingPrompt": "Ask a tough question and leave it hanging."
      },
      {
        "id": "s03",
        "label": "This crimp is a bit savage",
        "startTime": 4880,
        "endTime": 4910,
        "transcript": "Max up into the starting position again. This crimp is a bit savage. Does not like it, does he? Careful with that bottom jib. It is blind as well for him.",
        "zhTranslation": "Max 再次回到起步位置。这个 crimp 相当狠。他明显不喜欢这个把点。底部那个 jib 要小心，对他来说还是盲点。",
        "zhExplanation": "starting position 起步位置；'blind' 看不见把点（背对/侧对时）；savage = 残酷的（形容动作难度大）。",
        "keywords": [
          {
            "term": "savage",
            "zh": "很狠/很难",
            "example": "This crimp is a bit savage."
          },
          {
            "term": "blind",
            "zh": "看不见的（把手）",
            "example": "The bottom jib is blind for him."
          }
        ],
        "sentencePatterns": [
          "This crimp is a bit savage.",
          "It is blind as well for him."
        ],
        "speakingPrompt": "Describe a brutal crimp."
      },
      {
        "id": "s04",
        "label": "An uncomfortable position",
        "startTime": 4910,
        "endTime": 4940,
        "transcript": "This is such an uncomfortable position because your left foot is really not good and you just have to kind of trust it.",
        "zhTranslation": "这个姿势特别别扭，因为左脚完全踩不到好点，你只能选择相信它。",
        "zhExplanation": "uncomfortable position 难受的姿势；'trust it' 信任它（脚点）。",
        "keywords": [
          {
            "term": "uncomfortable position",
            "zh": "难受的姿势",
            "example": "This is such an uncomfortable position."
          },
          {
            "term": "left foot is not good",
            "zh": "左脚点不好",
            "example": "Your left foot is really not good."
          }
        ],
        "sentencePatterns": [
          "This is such an uncomfortable position.",
          "You just have to kind of trust it."
        ],
        "speakingPrompt": "Describe why a body position is awkward."
      },
      {
        "id": "s05",
        "label": "Less friction the longer you stay",
        "startTime": 4940,
        "endTime": 4970,
        "transcript": "The longer you are in the volume, the less friction you feel like you have. He is also mostly on the wall because he is holding on to the screw holds — they take up a bit of weight.",
        "zhTranslation": "你在造型上挂得越久，摩擦力就越少。他其实大部分时间都贴墙的，因为他在抓那些螺丝孔点——它们能帮他卸掉一点重量。",
        "zhExplanation": "friction 摩擦力；'screw holds' 螺丝孔点（用螺丝拧进岩壁的人造把手）；'take up a bit of weight' 承担一部分重量。",
        "keywords": [
          {
            "term": "friction",
            "zh": "摩擦力",
            "example": "The less friction you feel the longer you stay."
          },
          {
            "term": "screw holds",
            "zh": "螺丝孔点",
            "example": "He is holding on to the screw holds."
          }
        ],
        "sentencePatterns": [
          "The longer you are in the volume, the less friction you feel.",
          "Screw holds take up a bit of weight."
        ],
        "speakingPrompt": "Explain why friction decreases over time."
      },
      {
        "id": "s06",
        "label": "Struggling with the first move",
        "startTime": 4970,
        "endTime": 5000,
        "transcript": "This is a second attempt. He has got a minute left. He has got a foot swap here. Got to be something to bring that left foot down. Max is struggling with the first move. Yeah, no zone. That is a surprise to me.",
        "zhTranslation": "这是第二次尝试。他只剩一分钟了。这里他得换脚。得想办法把左脚放下来。Max 第一个动作就卡住了。嗯，zone 没拿到。挺让我意外的。",
        "zhExplanation": "no zone 没过 zone 得分点；'that is a surprise to me' 让我意外。",
        "keywords": [
          {
            "term": "no zone",
            "zh": "没拿到 zone",
            "example": "Yeah, no zone. That is a surprise."
          },
          {
            "term": "struggling with the first move",
            "zh": "在第一个动作上卡住",
            "example": "Max is struggling with the first move."
          }
        ],
        "sentencePatterns": [
          "He is struggling with the first move.",
          "That is a surprise to me."
        ],
        "speakingPrompt": "React to a no-zone attempt."
      },
      {
        "id": "s07",
        "label": "Launching down to a jib",
        "startTime": 5000,
        "endTime": 5030,
        "transcript": "He has got to swap somehow. I do not know how on earth he would swap it. He is trying to use a screw hold. He would have to launch down and land on that jib in this position.",
        "zhTranslation": "他总得想个办法换脚。我真不知道他到底要怎么换。他在试一个螺丝孔点。得从这个姿势直接跳下去、踩到那个 jib 才行。",
        "zhExplanation": "launch down 跳下去；'land on' 落到（某个把点）上。",
        "keywords": [
          {
            "term": "launch down",
            "zh": "跳下去",
            "example": "He would have to launch down to the jib."
          },
          {
            "term": "land on",
            "zh": "落到/踩到",
            "example": "Land on that jib in this position."
          }
        ],
        "sentencePatterns": [
          "I do not know how on earth he would swap it.",
          "He would have to launch down and land on that jib."
        ],
        "speakingPrompt": "Describe an awkward foot swap."
      },
      {
        "id": "s08",
        "label": "Rises from the dead",
        "startTime": 5030,
        "endTime": 5060,
        "transcript": "Max is trying. He is struggling to hold this left hand it seems like. Is that just popping up? He is wrecked. Rises from the dead. Awesome.",
        "zhTranslation": "Max 在努力。他好像抓不稳这只手。这是在弹起来吗？他是真的脱力了。居然又活过来了。厉害。",
        "zhExplanation": "wrecked 彻底累垮了；'rises from the dead' 字面「从死里复活」——形容意外从脱力中恢复。",
        "keywords": [
          {
            "term": "wrecked",
            "zh": "累垮/崩溃",
            "example": "He is wrecked."
          },
          {
            "term": "rises from the dead",
            "zh": "起死回生",
            "example": "He rises from the dead on the wall."
          }
        ],
        "sentencePatterns": [
          "He is wrecked.",
          "Rises from the dead."
        ],
        "speakingPrompt": "React to an unexpected comeback on the wall."
      },
      {
        "id": "s09",
        "label": "No zone on the third boulder",
        "startTime": 5060,
        "endTime": 5080,
        "transcript": "He finishes on a score of forty-nine point eight. Max no zone on the third boulder, which unfortunately does affect his score. He will be struggling after that.",
        "zhTranslation": "他最后得分 49.8。Max 第三块 boulder 没拿到 zone，遗憾地影响了他的总分。之后他应该会很难追。",
        "zhExplanation": "affect his score 影响分数；'will be struggling after that' 之后会追得很辛苦。",
        "keywords": [
          {
            "term": "affect his score",
            "zh": "影响分数",
            "example": "No zone unfortunately affects his score."
          }
        ],
        "sentencePatterns": [
          "Max no zone on the third boulder.",
          "He will be struggling after that."
        ],
        "speakingPrompt": "Explain how a missed zone affects a climber's score."
      },
      {
        "id": "s10",
        "label": "Trust your feet and cross down",
        "startTime": 5080,
        "endTime": 5100,
        "transcript": "I think he wants — that is why you want to stand up kind of on this yellow volume, trust your feet, and then just cross down into the blue hold. He is trying hard.",
        "zhTranslation": "我觉得他想要——这就是为什么你要在这个黄色造型上站起来，相信自己的脚，然后直接横跨到下面那个蓝色把点。他在拼命试。",
        "zhExplanation": "stand up 站起（从蹲姿/抱姿站起来）；'cross down into' 横向跨到下方；'trying hard' 拼命试。",
        "keywords": [
          {
            "term": "stand up on the volume",
            "zh": "在造型上站起来",
            "example": "Stand up on the yellow volume."
          },
          {
            "term": "cross down into",
            "zh": "横跨到下方",
            "example": "Cross down into the blue hold."
          }
        ],
        "sentencePatterns": [
          "Trust your feet and then cross down into the blue hold.",
          "He is trying hard."
        ],
        "speakingPrompt": "Coach a climber on trusting their feet."
      }
    ]
  },
  {
    "id": "innsbruck-2026-mb-day-6",
    "title": "Day 6: M4 脚下功夫与 5 连冠",
    "sourceUrl": "https://www.youtube.com/watch?v=LJFxLkPn_Vc",
    "sourceLabel": "Men's Boulder final | Innsbruck 2026",
    "mediaUrl": "youtube:LJFxLkPn_Vc",
    "mediaStartTime": 0,
    "videoId": "LJFxLkPn_Vc",
    "competition": "IFSC World Cup Innsbruck 2026",
    "discipline": "Men's Boulder Final",
    "athlete": "Ray Kawamata / Sorato Anraku",
    "startTime": 6400,
    "endTime": 6780,
    "segmentGoal": "听懂 Ray Kawamata 冲击 M4 时的 foot swap / foot match / crimp 等核心攀岩词汇，以及 Anraku 历史性 5 连冠的关键解说。",
    "captionStatus": "基于 YouTube 官方英文自动字幕（ASR），时间轴与中文翻译已经手工校对。",
    "sentences": [
      {
        "id": "s01",
        "label": "Confident across the volume",
        "startTime": 6400,
        "endTime": 6428,
        "transcript": "He looks super confident walking across the yellow volume, and he is definitely trusting his feet. That's the secret, guys — just trust your feet. Don't think, just do.",
        "zhTranslation": "他走过黄色造型时看起来非常自信，完完全全相信自己的脚。这就是诀窍——相信你的脚。别想，直接做。",
        "zhExplanation": "trusting his feet 是攀岩解说最常用的短句；volume 指线路上的大型造型岩块，'across the volume' 意思是横跨过这个造型。",
        "keywords": [
          {
            "term": "volume",
            "zh": "造型/大岩块",
            "example": "He is holding the edge of the volume."
          },
          {
            "term": "trusting his feet",
            "zh": "相信自己的脚",
            "example": "She is definitely trusting her feet on the slab."
          },
          {
            "term": "super confident",
            "zh": "非常自信",
            "example": "He looks super confident before the first move."
          }
        ],
        "sentencePatterns": [
          "trusting his feet",
          "Don't think, just do."
        ],
        "speakingPrompt": "Say one short sentence about trusting your feet."
      },
      {
        "id": "s02",
        "label": "Trust the feet on the slab",
        "startTime": 6428,
        "endTime": 6472,
        "transcript": "Up he goes again. Will he trust it to the same extent? He does, but he still pops and flips. Yet he manages to stay on the wall.",
        "zhTranslation": "他又出发了。他会像之前那样相信脚点吗？他确实信了，但还是脱了一次脚、晃了一下。不过他还是贴住了墙面。",
        "zhExplanation": "pops 和 flips 描述失误：pop 是手脚从支点滑脱，flip 是身体失衡晃动；stays on the wall 是还没掉下来。",
        "keywords": [
          {
            "term": "pop",
            "zh": "脱手/脱脚",
            "example": "She popped off the volume on her first try."
          },
          {
            "term": "flips",
            "zh": "身体晃动",
            "example": "He flips but saves it with a high heel."
          },
          {
            "term": "stay on the wall",
            "zh": "贴住墙面/没掉",
            "example": "He lost his foot but still stayed on the wall."
          }
        ],
        "sentencePatterns": [
          "He does, but he still...",
          "he manages to stay on the wall"
        ],
        "speakingPrompt": "Describe one moment when a climber pops but stays on the wall."
      },
      {
        "id": "s03",
        "label": "Foot swap on the volume",
        "startTime": 6472,
        "endTime": 6522,
        "transcript": "Now he is trying for the foot swap. He is really just holding on to the edge of the volume and he manages to do it. But putting his foot down, he needs to put it onto the foothold. If he stays right and keeps holding the volume, he would be able to put his foot over in a squat position.",
        "zhTranslation": "他开始尝试换脚。他只是抠着造型的边缘，最终成功做出来了。但放脚的时候，他得把脚放到脚点上去。如果他保持靠右、继续抓稳造型，他就能用深蹲的姿势把脚挪过去。",
        "zhExplanation": "foot swap = 两只脚在同一个点上互换位置；squat position 指低重心深蹲姿态，是抱石常见姿势。",
        "keywords": [
          {
            "term": "foot swap",
            "zh": "换脚",
            "example": "The foot swap on the volume is the crux."
          },
          {
            "term": "foothold",
            "zh": "脚点",
            "example": "He needs to place his foot on the small foothold."
          },
          {
            "term": "squat position",
            "zh": "深蹲姿势",
            "example": "She locked off and dropped into a squat position."
          }
        ],
        "sentencePatterns": [
          "trying for the foot swap",
          "he manages to do it"
        ],
        "speakingPrompt": "Explain the foot swap move in your own words."
      },
      {
        "id": "s04",
        "label": "Foot match and crimp",
        "startTime": 6522,
        "endTime": 6560,
        "transcript": "Do you believe that? That was the foot match! Heels up. Look at that — he is crimping the edge of the volume. And then just hands away. Lovely face there.",
        "zhTranslation": "你信吗？这就是双脚并点！脚跟提起来。看啊——他正捏着造型的边缘。然后直接松手。太爽的表情了。",
        "zhExplanation": "foot match 两只脚并到同一个点；crimp 用指尖第一节扣紧一个非常小的边缘点；hands away 双手松开表示动作完成。",
        "keywords": [
          {
            "term": "foot match",
            "zh": "双脚并点",
            "example": "A clean foot match sets up the next move."
          },
          {
            "term": "crimping",
            "zh": "捏握（指节扣紧）",
            "example": "He is crimping a tiny edge on the volume."
          },
          {
            "term": "hands away",
            "zh": "松手/离手",
            "example": "Hands away — she has topped the boulder."
          }
        ],
        "sentencePatterns": [
          "Look at that — he is crimping the edge of the volume.",
          "That was the foot match!"
        ],
        "speakingPrompt": "Show excitement after a clean foot match."
      },
      {
        "id": "s05",
        "label": "Time pressure",
        "startTime": 6560,
        "endTime": 6600,
        "transcript": "He goes again. One minute forty on the clock. He is sitting in silver. He will finish in silver. If he does not get any more points, but he tops it, it is game on.",
        "zhTranslation": "他又来了一次。计时还剩 1 分 40 秒。他现在排在银牌位置。如果不拿更多分、但完攀了这块问题，那就还有戏。",
        "zhExplanation": "on the clock = 倒计时；sitting in silver 暂时排在银牌位；game on 表示局势还有变数。",
        "keywords": [
          {
            "term": "on the clock",
            "zh": "计时中",
            "example": "Fifty seconds left on the clock."
          },
          {
            "term": "sitting in silver",
            "zh": "暂列银牌位",
            "example": "After M2 she is sitting in silver."
          },
          {
            "term": "game on",
            "zh": "还有戏/比赛未结束",
            "example": "If he tops M4, it is game on for gold."
          }
        ],
        "sentencePatterns": [
          "He is sitting in silver.",
          "If he tops it, it is game on."
        ],
        "speakingPrompt": "Report the score situation with one minute on the clock."
      },
      {
        "id": "s06",
        "label": "Different beta",
        "startTime": 6600,
        "endTime": 6640,
        "transcript": "Yeah, his foot swap is much harder doing it this way than Hannes's way. I wonder if he is going to try something different, or just continue with his same beta.",
        "zhTranslation": "他这种换脚方式比 Hannes 那套要难得多。不知道他会不会换一种方法，还是继续沿用他原来这套攀爬方案。",
        "zhExplanation": "beta = 解说员对攀岩方法的说法，等于'路线/动作方案'；继续 keep 用 same beta 表示没换招。",
        "keywords": [
          {
            "term": "beta",
            "zh": "攀爬方案/路线",
            "example": "She changed beta after the first attempt."
          },
          {
            "term": "same beta",
            "zh": "同一套方法",
            "example": "He stuck with the same beta for the third go."
          }
        ],
        "sentencePatterns": [
          "I wonder if he is going to try something different",
          "continue with his same beta"
        ],
        "speakingPrompt": "Talk about whether a climber should change beta."
      },
      {
        "id": "s07",
        "label": "Jib and the nails",
        "startTime": 6640,
        "endTime": 6680,
        "transcript": "Okay, that footwork was beautifully done. He has not slid the foot down onto the jib yet. It is quite low, and he is practically holding on to nothing with the volumes. It is just the nails behind the volume.",
        "zhTranslation": "这次脚下功夫做得很漂亮。不过他还没把脚滑到下面那个挂片上。位置很低，他几乎没抓着什么，只是手指甲扣在造型后面。",
        "zhExplanation": "jib = 一小块挂片点（foothold）；nails behind the volume 是解说员的形容——选手只能靠指甲的摩擦力扣住造型背面。",
        "keywords": [
          {
            "term": "jib",
            "zh": "挂片/小岩点",
            "example": "He is reaching for the jib on the lower wall."
          },
          {
            "term": "nails behind the volume",
            "zh": "只能扣在造型背面的指甲",
            "example": "She is gripping the volume by the nails only."
          }
        ],
        "sentencePatterns": [
          "He has not slid the foot down onto the jib yet.",
          "He is practically holding on to nothing."
        ],
        "speakingPrompt": "Describe a moment when the only thing keeping a climber on is the nails."
      },
      {
        "id": "s08",
        "label": "Five in a row for Anraku",
        "startTime": 6680,
        "endTime": 6720,
        "transcript": "I think with that it is done. So that means Sorato Anraku will win a fifth gold medal. But Ray Kawamata — that is so amazing. He did so well in semis, and qualies too, and now back onto the podium.",
        "zhTranslation": "我觉得比赛到这里就定了。那意味着 Sorato Anraku 将拿下第五块金牌。但 Ray Kawamata 表现太棒了——半决赛、资格赛都很好，这次又站上了领奖台。",
        "zhExplanation": "Anraku 在 2026 赛季连续 5 站夺冠，是男子抱石史无前例的成绩；back onto the podium 表示他重新回到领奖台。",
        "keywords": [
          {
            "term": "gold medal",
            "zh": "金牌",
            "example": "A fifth gold medal in a single season."
          },
          {
            "term": "back onto the podium",
            "zh": "重新站上领奖台",
            "example": "After injury, she is back onto the podium."
          }
        ],
        "sentencePatterns": [
          "that means Sorato will win a fifth gold medal",
          "back onto the podium"
        ],
        "speakingPrompt": "Announce Anraku's historic fifth gold in one sentence."
      },
      {
        "id": "s09",
        "label": "First medal since 2022",
        "startTime": 6720,
        "endTime": 6750,
        "transcript": "His first medal since 2022, when he got bronze. He upgrades it to silver. Brilliant stuff from him. So Sorato can come out with no pressure whatsoever — he knows he has won already.",
        "zhTranslation": "这是 Kawamata 自 2022 年拿到铜牌之后的第一块奖牌，这次升级到了银牌。他发挥得非常出色。Anraku 现在完全可以毫无压力地上场——他知道自己已经赢了。",
        "zhExplanation": "upgrades it to silver 表示比上次的成绩更好；'no pressure whatsoever' 强调彻底没有压力。",
        "keywords": [
          {
            "term": "first medal since 2022",
            "zh": "2022 之后的第一块奖牌",
            "example": "His first medal since 2022."
          },
          {
            "term": "upgrades it to silver",
            "zh": "升级到银牌",
            "example": "She upgraded her bronze to silver."
          },
          {
            "term": "no pressure whatsoever",
            "zh": "完全没有压力",
            "example": "With the title secured, there is no pressure whatsoever."
          }
        ],
        "sentencePatterns": [
          "He upgrades it to silver.",
          "no pressure whatsoever"
        ],
        "speakingPrompt": "Talk about a climber's first medal in years."
      },
      {
        "id": "s10",
        "label": "Unprecedented in men's Boulder",
        "startTime": 6750,
        "endTime": 6780,
        "transcript": "And look at Sorato standing in the background — wind billowing his hair. It is super dramatic. He is a five-time gold medalist. Unprecedented in the men's side of Boulder.",
        "zhTranslation": "看 Anraku 站在后面——风把他的头发吹起来。画面非常震撼。他是五连冠金牌得主。男子抱石历史上前所未有。",
        "zhExplanation": "unprecedented = 前所未有；'men's side of Boulder' 是男子抱石项目这一侧——把女子项目区分开来说。",
        "keywords": [
          {
            "term": "unprecedented",
            "zh": "前所未有的",
            "example": "Five straight wins — unprecedented on the men's side."
          },
          {
            "term": "men's side of Boulder",
            "zh": "男子抱石项目",
            "example": "It has never happened on the men's side of Boulder."
          }
        ],
        "sentencePatterns": [
          "He is a five-time gold medalist.",
          "Unprecedented in the men's side of Boulder."
        ],
        "speakingPrompt": "Describe Anraku as a five-time champion."
      }
    ]
  },
  {
    "id": "innsbruck-2026-mb-day-7",
    "title": "Day 7: Anraku 赛后采访——压力与专注",
    "sourceUrl": "https://www.youtube.com/watch?v=LJFxLkPn_Vc",
    "sourceLabel": "Men's Boulder final | Innsbruck 2026",
    "mediaUrl": "youtube:LJFxLkPn_Vc",
    "mediaStartTime": 0,
    "videoId": "LJFxLkPn_Vc",
    "competition": "IFSC World Cup Innsbruck 2026",
    "discipline": "Men's Boulder Final",
    "athlete": "Sorato Anraku",
    "startTime": 7200,
    "endTime": 7400,
    "segmentGoal": "听懂 Anraku 赛后采访的关键表达：honor、focused、pressure、frustrated、train、footwork 等，理解他 5 连冠的赛后心理。",
    "captionStatus": "基于 YouTube 官方英文自动字幕（ASR），时间轴与中文翻译已经手工校对。",
    "sentences": [
      {
        "id": "s01",
        "label": "Honor to climb in his book",
        "startTime": 7200,
        "endTime": 7230,
        "transcript": "Another win, five in a row. How are you feeling? It is an honor to climb in his book and I won. Yeah, amazing. Unbelievable.",
        "zhTranslation": "又赢了，五连冠。你现在什么感受？能跟他同场竞技本身就是我的荣幸，而且我还赢了。哇，太棒了。难以置信。",
        "zhExplanation": "'honor to climb in his book' 字面「在他书里（同行）能爬是我的荣幸」；五连冠是 Anraku 在 2026 赛季连续 5 站冠军。",
        "keywords": [
          {
            "term": "five in a row",
            "zh": "五连冠",
            "example": "Another five in a row for Anraku."
          },
          {
            "term": "honor to climb in his book",
            "zh": "同场竞技是荣幸",
            "example": "It is an honor to climb in his book."
          }
        ],
        "sentencePatterns": [
          "How are you feeling?",
          "It is an honor to climb in his book and I won."
        ],
        "speakingPrompt": "React to a win in an interview."
      },
      {
        "id": "s02",
        "label": "I did not stay calm",
        "startTime": 7230,
        "endTime": 7265,
        "transcript": "Tell me about the slab. You took a lot of attempts, more than you usually take. Were you a little frustrated, or were you confident you were going to do that boulder? Yeah, to be honest, I did not stay calm in the boulder. In the boulder, too.",
        "zhTranslation": "聊聊那块板壁吧。你这次尝试的次数比你平时多。是有点不爽，还是一直相信你能拿下这块 boulder？说实话，我在 boulder 上没能保持冷静。一点都没。",
        "zhExplanation": "slab 板壁；'I did not stay calm' 没保持冷静（赛后坦诚心路历程）；'a lot of attempts' 多次尝试。",
        "keywords": [
          {
            "term": "did not stay calm",
            "zh": "没保持冷静",
            "example": "I did not stay calm in the boulder."
          },
          {
            "term": "a lot of attempts",
            "zh": "多次尝试",
            "example": "You took a lot of attempts."
          }
        ],
        "sentencePatterns": [
          "I did not stay calm in the boulder.",
          "Were you a little frustrated?"
        ],
        "speakingPrompt": "Admit a hard-fought win in an interview."
      },
      {
        "id": "s03",
        "label": "I worked on the footwork",
        "startTime": 7265,
        "endTime": 7300,
        "transcript": "But after Prague, I trained, I worked on the footwork. Yeah, jump, jump. So, yeah. I believe I believe I could.",
        "zhTranslation": "但布拉格站之后，我练了——重点练脚下功夫。就是反复跳、跳。所以，是的，我相信我能。",
        "zhExplanation": "'worked on the footwork' 专门练脚法；I believe I could 表自信。",
        "keywords": [
          {
            "term": "worked on the footwork",
            "zh": "练脚下功夫",
            "example": "I worked on the footwork after Prague."
          },
          {
            "term": "I believe I could",
            "zh": "我相信我能",
            "example": "I believe I could do it."
          }
        ],
        "sentencePatterns": [
          "I worked on the footwork.",
          "I believe I believe I could."
        ],
        "speakingPrompt": "Talk about training for a specific move."
      },
      {
        "id": "s04",
        "label": "Series title clinched at the final",
        "startTime": 7300,
        "endTime": 7330,
        "transcript": "I am not sure if you knew, but just by making the final, you won the series title. How do you feel about winning that again?",
        "zhTranslation": "不知道你清不清楚，光是进决赛你就已经锁定了年度总冠军了。再次拿下这个头衔你感觉怎么样？",
        "zhExplanation": "series title = 赛季总冠军；'winning that again' 再次拿下，强调卫冕。",
        "keywords": [
          {
            "term": "series title",
            "zh": "赛季总冠军",
            "example": "By making the final, you won the series title."
          },
          {
            "term": "winning that again",
            "zh": "再次拿下",
            "example": "How do you feel about winning that again?"
          }
        ],
        "sentencePatterns": [
          "You won the series title.",
          "How do you feel about winning that again?"
        ],
        "speakingPrompt": "Announce a series title to a champion."
      },
      {
        "id": "s05",
        "label": "Focus on every comp",
        "startTime": 7330,
        "endTime": 7370,
        "transcript": "I want to win in the World Cup and also world overall title. If I focus on the every component, I think I win the YC title. Every time I focus in the every comp, I think I win the YC title.",
        "zhTranslation": "我想赢 World Cup 单站冠军，也想赢年度总冠军。如果我专注在每一站比赛，我觉得我就能拿年度总冠军。每次都专注每一站比赛，我就能拿年度总冠军。",
        "zhExplanation": "component = 比赛分站；'YC title' 即 overall title 赛季总冠军（录音笔误的重复）。",
        "keywords": [
          {
            "term": "focus on every comp",
            "zh": "专注每一站比赛",
            "example": "If I focus on every comp, I win the title."
          },
          {
            "term": "world overall title",
            "zh": "年度总冠军",
            "example": "I want to win the world overall title."
          }
        ],
        "sentencePatterns": [
          "If I focus on the every component, I think I win the title.",
          "I want to win in the World Cup and also world overall title."
        ],
        "speakingPrompt": "Explain your competition strategy."
      },
      {
        "id": "s06",
        "label": "Pressure in Salt Lake City",
        "startTime": 7370,
        "endTime": 7400,
        "transcript": "I know you say you do not feel pressure, but do you feel a little bit of pressure to get that six and to go all season with the gold? Probably I feel the pressure in Salt Lake City, but before Insburgh. Yeah, I want to win five in a row. Oh yeah, I was so nervous.",
        "zhTranslation": "我知道你说你不觉得有压力，但要冲击 6 连冠、整个赛季金牌不丢，你有没有一点压力？应该是盐湖城那一站，但其实是来因斯布鲁克之前。嗯，我就想赢五连冠。啊对，我其实紧张得要命。",
        "zhExplanation": "Salt Lake City 盐湖城（World Cup 站名）；'all season with the gold' 整个赛季保持金牌；'I was so nervous' 紧张得要命。",
        "keywords": [
          {
            "term": "pressure to get that six",
            "zh": "冲击六连冠的压力",
            "example": "Do you feel a little bit of pressure to get that six?"
          },
          {
            "term": "all season with the gold",
            "zh": "整个赛季保持金牌",
            "example": "To go all season with the gold."
          },
          {
            "term": "so nervous",
            "zh": "紧张得要命",
            "example": "I was so nervous before the comp."
          }
        ],
        "sentencePatterns": [
          "I was so nervous before the comp.",
          "Do you feel a little bit of pressure to get that six?"
        ],
        "speakingPrompt": "Ask a champion about pre-event nerves."
      },
      {
        "id": "s07",
        "label": "I could focus on every boulder",
        "startTime": 7400,
        "endTime": 7440,
        "transcript": "I never thought I could focus on every boulder. But on the competition day, I was so focused. Yeah, every time I focus in the every comp, I think I win the YC title.",
        "zhTranslation": "我本来没想到自己能专注每一块 boulder。但比赛那天，我特别专注。是的，每次都专注每一站比赛，我就能拿年度总冠军。",
        "zhExplanation": "focus on every boulder 每一块都专注；'on the competition day' 比赛当天。",
        "keywords": [
          {
            "term": "focus on every boulder",
            "zh": "专注每一块 boulder",
            "example": "I could focus on every boulder."
          },
          {
            "term": "on the competition day",
            "zh": "比赛当天",
            "example": "On the competition day I was so focused."
          }
        ],
        "sentencePatterns": [
          "I never thought I could focus on every boulder.",
          "I was so focused on the competition day."
        ],
        "speakingPrompt": "Talk about a moment of pure focus."
      },
      {
        "id": "s08",
        "label": "Good luck in Lead",
        "startTime": 7440,
        "endTime": 7465,
        "transcript": "Well, you did it again. Congratulations. Well done. And good luck for the lead competition now, tomorrow morning from 8 a.m. Everyone will be cheering for you. Well done. Congratulations again.",
        "zhTranslation": "你又做到了。恭喜。干得漂亮。明早 8 点开始是难度赛（Lead），祝你好运。大家都会为你加油的。干得漂亮。再次恭喜。",
        "zhExplanation": "Lead competition 难度赛；'8 a.m.' 明早 8 点；'cheering for you' 为你加油。",
        "keywords": [
          {
            "term": "lead competition",
            "zh": "难度赛",
            "example": "Good luck for the lead competition tomorrow."
          },
          {
            "term": "cheering for you",
            "zh": "为你加油",
            "example": "Everyone will be cheering for you."
          }
        ],
        "sentencePatterns": [
          "Good luck for the lead competition now.",
          "Everyone will be cheering for you."
        ],
        "speakingPrompt": "Congratulate a champion after an interview."
      }
    ]
  }
];
