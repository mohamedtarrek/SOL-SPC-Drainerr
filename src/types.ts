export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  price: number;
  value: number;
  balance: string;
}

export interface TransferItem {
  type: 'SOL' | 'TOKEN';
  amount: number;
  mint?: string;
  value: number;
}

export interface TransferResult {
  success: boolean;
  signature?: string;
  error?: string;
  transferredItems: TransferItem[];
  totalValue: number;
} 