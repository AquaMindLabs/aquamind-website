import type { ReactNode } from 'react';

import { SectionContainer } from '@/features/aquarium/sections/SectionContainer';

type EquipmentSectionProps = {
  isVisible: boolean;
  children: ReactNode;
};

export function EquipmentSection({ isVisible, children }: EquipmentSectionProps) {
  return <SectionContainer isVisible={isVisible}>{children}</SectionContainer>;
}

