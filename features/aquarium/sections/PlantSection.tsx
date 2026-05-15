import type { ReactNode } from 'react';

import { SectionContainer } from '@/features/aquarium/sections/SectionContainer';

type PlantSectionProps = {
  isVisible: boolean;
  children: ReactNode;
};

export function PlantSection({ isVisible, children }: PlantSectionProps) {
  return <SectionContainer isVisible={isVisible}>{children}</SectionContainer>;
}

