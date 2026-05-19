import type { ReactNode } from 'react';

type TankDetailsScreenProps = {
  visible: boolean;
  children: ReactNode;
};

export function TankDetailsScreen({ visible, children }: TankDetailsScreenProps) {
  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
