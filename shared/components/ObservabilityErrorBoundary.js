import React from 'react';
import { View, Text } from 'react-native';
import { logTelemetryError } from '@/shared/services/observability';

export default class ObservabilityErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    logTelemetryError(error, {
      source: 'react_error_boundary',
      componentStack: errorInfo?.componentStack ?? '',
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#101827',
          paddingHorizontal: 20,
        }}>
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 18,
            fontWeight: '700',
            marginBottom: 10,
          }}>
          Wystapil nieoczekiwany blad.
        </Text>
        <Text
          style={{
            color: '#D4D8E0',
            textAlign: 'center',
            lineHeight: 20,
          }}>
          Uruchom aplikacje ponownie. Zgloszenie bledu zostalo zapisane.
        </Text>
      </View>
    );
  }
}
