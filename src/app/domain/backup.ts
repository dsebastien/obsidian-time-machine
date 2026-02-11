import { format, formatDistanceToNow } from 'date-fns'
import type { FileRecoveryBackup } from '../types/backup.intf'

export function sortBackupsByDate(backups: FileRecoveryBackup[]): FileRecoveryBackup[] {
    return [...backups].sort((a, b) => b.ts - a.ts)
}

export function formatBackupDate(ts: number): string {
    return format(new Date(ts), 'yyyy-MM-dd HH:mm')
}

export function formatRelativeTime(ts: number): string {
    return formatDistanceToNow(new Date(ts), { addSuffix: true })
}
