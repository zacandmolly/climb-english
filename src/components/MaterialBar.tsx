import { ListMusic } from 'lucide-react';
import type { Course, VideoSummary } from '../types';

// 素材被卡拉OK重切版取代：课程素材的解说内容已由视频管线完整重切并配
// 上 cue 级卡拉OK字幕时，课程入口从素材栏隐藏，只保留卡拉OK版本。
// key = 课程 id（slugifyCourseId(competition)），value = 取代它的视频 id。
// 课程数据本身保留（听力/进度/翻译回填的参考来源），只是不再作为素材入口。
export const COURSE_SUPERSEDED_BY_VIDEO: Record<string, string> = {
  'ifsc-world-cup-bern-2025': 'bern-2025-wb-rescut',
  'ifsc-world-cup-innsbruck-2026': 'innsbruck-2026-mb-full',
};

// 素材栏——素材选择的唯一入口模块。
// 选择已有素材（课程或视频）、或经导入管线（npm run import:youtube）更新
// 素材后，新素材都从这里进入学习流程。见 README「素材上线流程」。
export function MaterialBar({
  courses,
  activeCourseId,
  completedSessionIds,
  onSelectCourse,
  videos,
  activeVideoId,
  onSelectVideo,
}: {
  courses: Course[];
  activeCourseId: string;
  completedSessionIds: Set<string>;
  onSelectCourse: (courseId: string) => void;
  videos: VideoSummary[];
  activeVideoId: string | null;
  onSelectVideo: (videoId: string) => void;
}) {
  const selectableCourses = courses.filter((course) => !COURSE_SUPERSEDED_BY_VIDEO[course.id]);

  return (
    <div className="course-bar" aria-label="素材选择">
      <span className="course-bar-label">
        <ListMusic size={15} aria-hidden="true" />
        素材
      </span>
      <div className="course-options">
        {selectableCourses.map((course) => {
          const done = course.sessions.filter((session) =>
            completedSessionIds.has(session.id),
          ).length;
          const active = course.id === activeCourseId && !activeVideoId;
          return (
            <button
              className={`course-option ${active ? 'active' : ''}`}
              key={course.id}
              type="button"
              onClick={() => onSelectCourse(course.id)}
            >
              <strong>{course.name}</strong>
              <small>
                {done}/{course.sessions.length} 天
              </small>
            </button>
          );
        })}
        {videos.map((video) => (
          <button
            className={`course-option video-option ${video.id === activeVideoId ? 'active' : ''}`}
            key={video.id}
            type="button"
            title={video.title}
            onClick={() => onSelectVideo(video.id)}
          >
            <strong>{video.title}</strong>
            <small>卡拉OK · {video.studyCueCount} 学习句</small>
          </button>
        ))}
      </div>
    </div>
  );
}
