import {
  IconDataOutline16,
  IconEditOutline16,
  IconLinkOutline16,
  IconRefreshOutline16,
  IconWarningOutline16,
} from '../../../components/base/icons.js'
import { appVersion } from '../../../platform/index.js'
import { closeIntro, useIntro } from '../store.js'
import styles from '../intro.module.css'

const CHANGES = [
  {
    icon: <IconEditOutline16 />,
    title: '给配角也建一份档案',
    desc: '设置 → 记忆 → 打开配角库（微信界面在「我」页）。每个会话一套配角，名字、触发词、身份、说话方式、称呼、关系各占一行。只有触发词出现在最近几条消息里、或标了「常驻」的那几条会贴进上下文，没出场的配角不占位置也不花钱。配角库可以导入导出，换会话搬得走。',
  },
  {
    icon: <IconDataOutline16 />,
    title: '角色卡能互相搬了',
    desc: '角色编辑页多了「导出角色卡」，管理角色多了「导入角色卡」：SillyTavern 的 V2 / V1 卡能直接导进来，Gaia 自己导出的也能导回去。卡里若夹带了档案卡与记忆文件，导入时会一并落地（同名记忆文件不覆盖）——换台手机不用从头聊起。',
  },
  {
    icon: <IconWarningOutline16 />,
    title: '启动失败不再是一屏白',
    desc: '装配或渲染出错时，现在会显示一屏能读的错误原因，下面还有：重试 / 复制诊断 / 保存诊断文件 / 改用经典界面并重启 / 清空本地数据并重启。以前遇到这种情况只有白屏，只能去系统设置里清数据，连原因都拿不到。',
  },
  {
    icon: <IconRefreshOutline16 />,
    title: '「我上次是怎么说的」能答上来了',
    desc: '挑记忆时现在看词有多罕见：「哥哥」「姐姐」这类满篇都是的称呼、「的了是我」这类虚词，不再算「问的就是这条」的证据，专名才算。记忆库里若存了原文档案（/archive/ 开头的文件），会把命中那句的前后各两条整段取回来，而不是只给一行提炼过的事实——细节、台词对得上了。',
  },
  {
    icon: <IconLinkOutline16 />,
    title: '换服务商后模型列表有说法了',
    desc: '设置 → 模型 里，当前服务商还没拉到模型列表时，现在会直接提示去「接入 → 服务商」点「拉取模型列表」，或在那里手填模型名；列表里也不再是一片空白让人以为坏了。',
  },
]

/** 挂在 app.overlay 上：关闭时不渲染，开启状态由 store 订阅驱动 */
export const IntroOverlay = () => {
  const open = useIntro((state) => state.open)
  return open ? <IntroDialog /> : null
}

/** 更新公告：画中画卡片，点蒙版或「知道了」关闭 */
const IntroDialog = () => (
  <div className={styles.overlay} role="dialog" aria-label="本次更新" onClick={closeIntro}>
    <div className={styles.card} onClick={(event) => event.stopPropagation()}>
      <div className={styles.head}>
        <div className={styles.brand}>
          <span className={styles.mark}>G</span>
          <span className={styles.brandName}>Gaia</span>
          <span className={styles.version}>v{appVersion()}</span>
        </div>
        <div className={styles.title}>本次更新</div>
        <div className={styles.subtitle}>
          这一版能给配角建档、把角色卡搬来搬去，也不会再一启动就白屏了。
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.points}>
          {CHANGES.map((change) => (
            <div key={change.title} className={styles.point}>
              <span className={styles.pointIcon}>{change.icon}</span>
              <span className={styles.pointText}>
                <div className={styles.pointTitle}>{change.title}</div>
                <div className={styles.pointDesc}>{change.desc}</div>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.start} onClick={closeIntro}>
          知道了
        </button>
        <div className={styles.hint}>
          旧版的历史会话可以在 设置 → 数据管理 → 上传历史文件 里导入
        </div>
      </div>
    </div>
  </div>
)
