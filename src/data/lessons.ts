import type { Lesson } from '../types';
import { bernLessons } from './lessons.generated';
import { innsbruckLessons } from './lessons.manual';

export const lessons: Lesson[] = [...bernLessons, ...innsbruckLessons];
