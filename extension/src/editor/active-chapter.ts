let _activeChapterRelPath: string | undefined

export function setActiveChapterRelPath(relPath: string | undefined): void {
  _activeChapterRelPath = relPath
}

export function getActiveChapterRelPath(): string | undefined {
  return _activeChapterRelPath
}
