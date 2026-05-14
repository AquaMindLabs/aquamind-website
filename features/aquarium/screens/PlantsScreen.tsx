import type { ReactNode } from 'react';

type PlantsScreenProps = {
  visible: boolean;
  children: ReactNode;
};

export function PlantsScreen({ visible, children }: PlantsScreenProps) {
  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
