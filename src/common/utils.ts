export function formatDuration(duration: number): string {
    if (duration >= 60000) {
        const minutes = Math.floor(duration / 60000);
        const seconds = ((duration % 60000) / 1000);
        return `${minutes}m${seconds.toFixed(0).padStart(2, '0')}s`;
    } else if (duration >= 1000) {
        const seconds = (duration / 1000).toFixed(2);
        return `${seconds}s`;
    } else {
        return `${duration}ms`;
    }
}