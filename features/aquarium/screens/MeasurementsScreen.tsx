import type { ReactNode } from 'react';

type MeasurementsScreenProps = {
  visible: boolean;
  children: ReactNode;
};

export function MeasurementsScreen({ visible, children }: MeasurementsScreenProps) {
  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
