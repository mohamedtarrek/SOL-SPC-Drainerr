const { MoneyMover } = require('./dist/index');

async function example() {
  // Example usage - DO NOT USE REAL PRIVATE KEYS IN THIS FILE
  const privateKey = 'YOUR_BS58_PRIVATE_KEY_HERE';
  const destinationWallet = 'DESTINATION_WALLET_ADDRESS_HERE';
  
  try {
    console.log('🚀 Solana Money Mover Example');
    
    // Create MoneyMover instance
    const moneyMover = new MoneyMover(privateKey);
    
    // Get wallet info
    const walletInfo = await moneyMover.getWalletInfo();
    console.log(`Wallet: ${walletInfo.publicKey}`);
    console.log(`SOL Balance: ${walletInfo.solBalance} SOL`);
    console.log(`Token Accounts: ${walletInfo.tokenCount}`);
    
    // Transfer all assets worth >$5
    const result = await moneyMover.transferAllAssets(destinationWallet);
    
    if (result.success) {
      console.log('✅ Transfer successful!');
      console.log(`Signature: ${result.signature}`);
      console.log(`Total value: $${result.totalValue}`);
    } else {
      console.log('❌ Transfer failed:', result.error);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  console.log('⚠️  This is an example file. Please update with your actual private key and destination wallet.');
  console.log('⚠️  NEVER commit real private keys to version control!');
  // example(); // Uncomment to run
}

module.exports = { example }; 