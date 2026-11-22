import { create } from 'zustand'

/** 诊断页开合：只有 diagnostics 积木读写 */
export const useDiagnostics = create<{ open: boolean }>(() => ({ open: false }))

export const openDiagnostics = (): void => useDiagnostics.setState({ open: true })

export const closeDiagnostics = (): void => useDiagnostics.setState({ open: false })
