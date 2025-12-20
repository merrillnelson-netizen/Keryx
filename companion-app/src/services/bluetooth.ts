/**
 * Bluetooth SCO Audio Service
 * Manages connection to Oakley Meta HSTN glasses
 */

import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic';
import type { DeviceContext } from '../types/mcp';

type ConnectionCallback = (device: DeviceContext) => void;
type DisconnectionCallback = () => void;

class BluetoothService {
  private connectedDevice: BluetoothDevice | null = null;
  private deviceContext: DeviceContext | null = null;
  private onConnect?: ConnectionCallback;
  private onDisconnect?: DisconnectionCallback;

  async initialize(): Promise<void> {
    const available = await RNBluetoothClassic.isBluetoothAvailable();
    if (!available) {
      throw new Error('Bluetooth is not available on this device');
    }

    const enabled = await RNBluetoothClassic.isBluetoothEnabled();
    if (!enabled) {
      throw new Error('Bluetooth is not enabled');
    }
  }

  async scanForDevices(): Promise<BluetoothDevice[]> {
    const devices = await RNBluetoothClassic.startDiscovery();
    return devices.filter(
      (device) =>
        device.name?.toLowerCase().includes('oakley') ||
        device.name?.toLowerCase().includes('meta') ||
        device.name?.toLowerCase().includes('ray-ban')
    );
  }

  async connectToDevice(device: BluetoothDevice): Promise<DeviceContext> {
    try {
      const connected = await device.connect();
      if (!connected) {
        throw new Error('Failed to connect to device');
      }

      this.connectedDevice = device;
      this.deviceContext = {
        id: device.address,
        type: this.detectDeviceType(device.name || ''),
        connection: 'bluetooth-sco',
      };

      this.onConnect?.(this.deviceContext);
      return this.deviceContext;
    } catch (error) {
      console.error('Bluetooth connection error:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.disconnect();
      } finally {
        this.connectedDevice = null;
        this.deviceContext = null;
        this.onDisconnect?.();
      }
    }
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  getDeviceContext(): DeviceContext | null {
    return this.deviceContext;
  }

  setConnectionCallbacks(
    onConnect: ConnectionCallback,
    onDisconnect: DisconnectionCallback
  ): void {
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;
  }

  async getPairedDevices(): Promise<BluetoothDevice[]> {
    const bonded = await RNBluetoothClassic.getBondedDevices();
    return bonded.filter(
      (device) =>
        device.name?.toLowerCase().includes('oakley') ||
        device.name?.toLowerCase().includes('meta') ||
        device.name?.toLowerCase().includes('ray-ban')
    );
  }

  private detectDeviceType(
    name: string
  ): 'oakley-hstn' | 'meta-glasses' | 'phone' {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('oakley') || lowerName.includes('hstn')) {
      return 'oakley-hstn';
    }
    if (lowerName.includes('meta') || lowerName.includes('ray-ban')) {
      return 'meta-glasses';
    }
    return 'phone';
  }
}

export const bluetoothService = new BluetoothService();
