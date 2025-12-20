/**
 * Helix Companion App
 * Main application component for Meta Glasses integration
 */

import React, { useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useHelix, HelixState } from './hooks/useHelix';

const STATE_MESSAGES: Record<HelixState, string> = {
  'idle': 'Tap to start',
  'listening-wake': 'Listening for "Hey Helix"...',
  'listening-command': 'Listening...',
  'processing': 'Processing...',
  'speaking': 'Speaking...',
  'error': 'Error occurred',
};

const STATE_COLORS: Record<HelixState, string> = {
  'idle': '#6B7280',
  'listening-wake': '#3B82F6',
  'listening-command': '#10B981',
  'processing': '#F59E0B',
  'speaking': '#8B5CF6',
  'error': '#EF4444',
};

async function requestPermissions(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      const grants = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);
      console.log('Permissions granted:', grants);
    } catch (err) {
      console.warn('Permission request failed:', err);
    }
  }
}

export default function App(): JSX.Element {
  const {
    state,
    isAuthenticated,
    isGlassesConnected,
    lastTranscript,
    lastAction,
    error,
    startListening,
    stopListening,
    connectGlasses,
  } = useHelix();

  useEffect(() => {
    requestPermissions();
  }, []);

  const handleMainButton = async () => {
    if (state === 'idle' || state === 'error') {
      await startListening();
    } else {
      await stopListening();
    }
  };

  const isActive = state !== 'idle' && state !== 'error';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Helix</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: isAuthenticated ? '#10B981' : '#EF4444' }]} />
          <Text style={styles.statusText}>{isAuthenticated ? 'Connected' : 'Not logged in'}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          style={[styles.mainButton, { borderColor: STATE_COLORS[state] }]}
          onPress={handleMainButton}
          activeOpacity={0.7}
        >
          <View style={[styles.innerCircle, { backgroundColor: STATE_COLORS[state] }]}>
            <Text style={styles.buttonIcon}>{isActive ? '◼' : '◉'}</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.stateMessage}>{STATE_MESSAGES[state]}</Text>

        {lastTranscript ? (
          <View style={styles.transcriptBox}>
            <Text style={styles.transcriptLabel}>
              {lastAction === 'query' ? 'Query:' : 'Recorded:'}
            </Text>
            <Text style={styles.transcriptText}>{lastTranscript}</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.glassesButton, isGlassesConnected && styles.glassesConnected]}
          onPress={connectGlasses}
        >
          <Text style={styles.glassesButtonText}>
            {isGlassesConnected ? '🕶️ Glasses Connected' : '🔗 Connect Glasses'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  mainButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
  },
  innerCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    fontSize: 48,
    color: '#FFFFFF',
  },
  stateMessage: {
    color: '#94A3B8',
    fontSize: 18,
    marginTop: 24,
    textAlign: 'center',
  },
  transcriptBox: {
    marginTop: 32,
    padding: 16,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    width: '100%',
  },
  transcriptLabel: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 4,
  },
  transcriptText: {
    color: '#F8FAFC',
    fontSize: 16,
    lineHeight: 24,
  },
  errorBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#7F1D1D',
    borderRadius: 8,
    width: '100%',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    textAlign: 'center',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  glassesButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#1E293B',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  glassesConnected: {
    borderColor: '#10B981',
    backgroundColor: '#064E3B',
  },
  glassesButtonText: {
    color: '#F8FAFC',
    fontSize: 16,
  },
});
