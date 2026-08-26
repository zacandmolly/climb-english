import { Target } from 'lucide-react';
import { BilingualStudio } from '../components/BilingualStudio';
import { MaterialBar } from '../components/MaterialBar';
import type { LessonLoadState } from './lessonLoading';
import { CoachPanel } from '../views/CoachPanel';
import { LibraryView } from '../views/LibraryView';
import { MeView } from '../views/MeView';
import { Sidebar } from '../views/Sidebar';
import { ListeningWorkspace, SentenceStrip, TodayFocusCard } from '../views/TodayView';
import { VocabView } from '../views/VocabView';
import { AppHeader, ViewNavigation } from './AppChrome';
import type { AppRuntime } from './useAppRuntime';

export function AppShell(props: AppRuntime) {
  const { navigation, course, video, progress, metrics, actions } = props;
  const videoModeClass = navigation.activeView === 'today' && video.activeVideo;

  return (
    <div className={`app-shell ${videoModeClass ? 'video-learning-mode' : ''}`}>
      <AppHeader
        courseReady={course.ready}
        completedSessionCount={course.completedSessionCount}
        sessionCount={course.sessions.length}
        streakDays={metrics.streakDays}
        onExport={actions.onExport}
      />
      <MaterialBar
        courses={course.ready ? course.courses : []}
        activeCourseId={course.activeCourseId}
        completedSessionIds={course.completedSessionIds}
        onSelectCourse={actions.onSwitchCourse}
        videos={video.summaries}
        activeVideoId={video.activeVideoId}
        onSelectVideo={actions.onSwitchVideo}
      />
      <ViewNavigation
        activeView={navigation.activeView}
        vocabCount={progress.vocab.length}
        onSwitchView={navigation.onSwitchView}
      />
      <AppBody {...props} />
    </div>
  );
}

function AppBody(props: AppRuntime) {
  return (
    <main className="app-body">
      <CourseSidebarSlot {...props} />
      <VideoStudioSlot {...props} />
      <LessonLoadSlot {...props} />
      <CoursePracticeSlot {...props} />
      <LibrarySlot {...props} />
      <VocabSlot {...props} />
      <MeSlot {...props} />
    </main>
  );
}

function CourseSidebarSlot({ course, progress, metrics, actions }: AppRuntime) {
  if (!course.ready) {
    return (
      <CourseSidebarPlaceholder
        status={course.status}
        onRequest={actions.onRequestLessons}
        onRetry={actions.onRetryLessons}
      />
    );
  }

  return (
    <Sidebar
      sessions={course.sessions}
      activeSessionIndex={course.activeSessionIndex}
      completedSessionIds={course.completedSessionIds}
      completedSessionCount={course.completedSessionCount}
      unlockedSessionIndex={course.unlockedSessionIndex}
      streakDays={metrics.streakDays}
      practiceDates={progress.practiceDates}
      onStartDailySession={actions.onStartDailySession}
    />
  );
}

function VideoStudioSlot({ navigation, video, actions }: AppRuntime) {
  if (!video.activeVideo) return null;
  const isActive = navigation.activeView === 'today';

  return (
    <div className="video-studio-preserver" hidden={!isActive} aria-hidden={!isActive}>
      <BilingualStudio
        key={video.activeVideo.id}
        summaries={[video.activeVideo]}
        hideLibraryStrip
        isActive={isActive}
        resumePosition={video.resumePosition}
        onPositionChange={actions.onRememberVideoPosition}
        onReturnToLibrary={actions.onReturnVideoToLibrary}
      />
    </div>
  );
}

function LessonLoadSlot({ navigation, course, video, actions }: AppRuntime) {
  if (course.ready) return null;
  if (navigation.activeView === 'today' && video.activeVideo) return null;

  return (
    <LessonLoadStatus
      status={course.status}
      onRequest={actions.onRequestLessons}
      onRetry={actions.onRetryLessons}
    />
  );
}

function CoursePracticeSlot({ navigation, course, video, practice, actions }: AppRuntime) {
  if (
    !course.ready ||
    navigation.activeView !== 'today' ||
    video.activeVideo ||
    !practice.lesson ||
    !practice.sentence
  ) {
    return null;
  }

  const activeSession = course.sessions[course.activeSessionIndex] ?? course.sessions[0];
  return (
    <section className="main-pane" aria-label="今日练习">
      <TodayFocusCard
        session={activeSession}
        sessions={course.sessions}
        completedSessionIds={course.completedSessionIds}
        completedSessionCount={course.completedSessionCount}
        unlockedSessionIndex={course.unlockedSessionIndex}
        onStart={actions.onStartTodaysSession}
        onComplete={actions.onCompleteActiveSession}
      />
      <SentenceStrip
        lesson={practice.lesson}
        activeSentenceIndex={practice.sentenceIndex}
        mode={practice.mode}
        onSelectSentence={actions.onSelectSentence}
        onSelectSegment={actions.onSelectSegment}
      />
      <ListeningWorkspace
        lesson={practice.lesson}
        sentence={practice.sentence}
        sentenceIndex={practice.sentenceIndex}
        mode={practice.mode}
        playRequestId={practice.playRequestId}
        onModeChange={actions.onModeChange}
        onSelectSegment={actions.onSelectSegment}
        onSelectSentence={actions.onSelectSentence}
        onNextSentence={actions.onNextSentence}
        onFollowSentence={actions.onFollowSentence}
      />
      <CoachPanel
        lesson={practice.lesson}
        sentence={practice.sentence}
        mode={practice.mode}
        currentDay={course.activeSessionIndex + 1}
        vocabTerms={practice.vocabTerms}
        onToggleVocabTerm={actions.onToggleVocabTerm}
      />
    </section>
  );
}

function LibrarySlot({ navigation, course, actions }: AppRuntime) {
  if (!course.ready || navigation.activeView !== 'library' || !course.activeCourse) return null;

  return (
    <LibraryView
      lessons={course.activeCourse.lessons}
      sessions={course.sessions}
      activeSessionIndex={course.activeSessionIndex}
      completedSessionIds={course.completedSessionIds}
      unlockedSessionIndex={course.unlockedSessionIndex}
      courseName={course.activeCourse.name}
      onStartDailySession={actions.onStartDailySession}
      onSelectSentence={actions.onSelectLibrarySentence}
    />
  );
}

function VocabSlot({ navigation, course, progress, metrics, actions }: AppRuntime) {
  if (!course.ready || navigation.activeView !== 'vocab') return null;

  return (
    <VocabView
      vocab={progress.vocab}
      courseNameById={metrics.courseNameById}
      onSetMastery={actions.onSetVocabMastery}
      onRemove={actions.onRemoveVocabTerm}
    />
  );
}

function MeSlot({ navigation, course, progress, metrics, actions }: AppRuntime) {
  if (!course.ready || navigation.activeView !== 'me') return null;
  const masteredCount = progress.vocab.filter((entry) => entry.mastery === 2).length;

  return (
    <MeView
      sessions={course.sessions}
      sourceSeconds={metrics.sourceSeconds}
      courseCount={course.courses.length}
      totalSessionCount={metrics.totalSessionCount}
      totalCompletedCount={metrics.totalCompletedCount}
      completedSessionCount={course.completedSessionCount}
      streakDays={metrics.streakDays}
      practiceDates={progress.practiceDates}
      vocabCount={progress.vocab.length}
      masteredCount={masteredCount}
      onExport={actions.onExport}
      onImport={actions.onImport}
      onReset={actions.onReset}
    />
  );
}

function CourseSidebarPlaceholder({
  status,
  onRequest,
  onRetry,
}: {
  status: LessonLoadState['status'];
  onRequest: () => void;
  onRetry: () => void;
}) {
  const message = courseLoadMessage(status);
  const actionLabel = status === 'loading' ? '加载中…' : '加载课程练习';

  return (
    <aside className="sidebar" aria-label="课程进度">
      <section className="sidebar-card">
        <div className="panel-heading">
          <Target size={16} aria-hidden="true" />
          <span>课程练习</span>
        </div>
        <p className="library-note">{message}</p>
        {status === 'failed' ? (
          <button className="control-button" type="button" onClick={onRetry}>
            重试加载
          </button>
        ) : (
          <button
            className="control-button"
            type="button"
            disabled={status === 'loading'}
            onClick={onRequest}
          >
            {actionLabel}
          </button>
        )}
      </section>
    </aside>
  );
}

function courseLoadMessage(status: LessonLoadState['status']): string {
  if (status === 'loading') return '正在按需加载课程数据…';
  if (status === 'failed') return '课程数据暂时不可用，视频练习不受影响。';
  return '视频模式不会预载课程数据，需要时再加载。';
}

function LessonLoadStatus({
  status,
  onRequest,
  onRetry,
}: {
  status: LessonLoadState['status'];
  onRequest: () => void;
  onRetry: () => void;
}) {
  if (status === 'failed') {
    return (
      <section className="main-pane empty-state" aria-label="课程数据状态">
        <div role="alert">
          <h2>课程数据加载失败</h2>
          <p>网络或课程分包暂时不可用。已保存的学习和视频位置不会丢失。</p>
          <button className="control-button primary" type="button" onClick={onRetry}>
            重试加载
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="main-pane empty-state" aria-label="课程数据状态">
      {status === 'loading' ? (
        <p role="status">正在加载课程数据…</p>
      ) : (
        <div>
          <p>课程数据尚未加载。</p>
          <button className="control-button primary" type="button" onClick={onRequest}>
            加载课程练习
          </button>
        </div>
      )}
    </section>
  );
}
