import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { logTelemetryError } from '@/shared/services/observability';

export default class ObservabilityErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const errorMessage =
      error instanceof Error ? String(error.message || error.name || '') : String(error ?? '');
    this.setState({
      errorMessage: errorMessage.slice(0, 240),
    });

    logTelemetryError(error, {
      source: 'react_error_boundary',
      errorMessage,
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
        {this.state.errorMessage ? (
          <Text
            style={{
              color: '#AEB8C6',
              textAlign: 'center',
              lineHeight: 18,
              marginTop: 10,
              fontSize: 12,
            }}>
            Szczegoly: {this.state.errorMessage}
          </Text>
        ) : null}
        <Pressable
          onPress={() => this.setState({ hasError: false, errorMessage: '' })}
          style={{
            marginTop: 14,
            borderWidth: 1,
            borderColor: '#4A5E78',
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 12,
          }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Sprobuj ponownie</Text>
        </Pressable>
      </View>
    );
  }
}
