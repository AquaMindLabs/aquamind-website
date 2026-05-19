import type { ReactNode } from 'react';

import { SectionContainer } from '@/features/aquarium/sections/SectionContainer';

type ReviewSectionProps = {
  isVisible: boolean;
  children: ReactNode;
};

export function ReviewSection({ isVisible, children }: ReviewSectionProps) {
  return <SectionContainer isVisible={isVisible}>{children}</SectionContainer>;
}

