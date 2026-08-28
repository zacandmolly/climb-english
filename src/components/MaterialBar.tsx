import { ListMusic } from 'lucide-react';
import { COURSE_SUPERSEDED_BY_VIDEO } from '../constants';
import type { Course, VideoSummary } from '../types';

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
            completedSessionIds.has(session.id)
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
