import type { ReactNode } from 'react';

type EquipmentScreenProps = {
  visible: boolean;
  children: ReactNode;
};

export function EquipmentScreen({ visible, children }: EquipmentScreenProps) {
  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
