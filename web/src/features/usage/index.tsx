import { defineBlock } from '../../platform/index.js'
import { StatusBar } from './StatusBar.js'

/** 用量积木：只读会话数据，产出底部状态栏 */
export const usage = defineBlock({
  id: 'usage',
  order: 100,
  flags: { usage: true },
  slots: {
    'chat.belowInput': [
      {
        id: 'status',
        order: 0,
        render: ({ sessionId, streaming }) => (
          <StatusBar sessionId={sessionId} streaming={streaming} />
        ),
      },
    ],
  },
})
