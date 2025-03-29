import { useState } from "react";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    MINT_SIZE, 
    TOKEN_2022_PROGRAM_ID, 
    createMintToInstruction, 
    createAssociatedTokenAccountInstruction, 
    getMintLen, 
    createInitializeMetadataPointerInstruction, 
    createInitializeMintInstruction, 
    TYPE_SIZE, 
    LENGTH_SIZE, 
    ExtensionType, 
    getAssociatedTokenAddressSync 
} from "@solana/spl-token";
import { createInitializeInstruction, pack } from '@solana/spl-token-metadata';

export function TokenLaunchpad() {
    const { connection } = useConnection();
    const wallet = useWallet();
    const [name, setName] = useState('');
    const [symbol, setSymbol] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [initialSupply, setInitialSupply] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [tokenAddress, setTokenAddress] = useState(null);

    async function createToken() {
        if (!wallet.connected || !wallet.publicKey) {
            setError("Please connect your wallet first");
            return;
        }

        if (!name || !symbol || !imageUrl || !initialSupply) {
            setError("Please fill in all fields");
            return;
        }

        setIsLoading(true);
        setError(null);
        setTokenAddress(null);

        try {
            const mintKeypair = Keypair.generate();
            const metadata = {
                mint: mintKeypair.publicKey,
                name: name,
                symbol: symbol.slice(0, 10), // Limiting symbol length to 10 chars
                uri: imageUrl,
                additionalMetadata: [],
            };

            const mintLen = getMintLen([ExtensionType.MetadataPointer]);
            const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
            const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

            // Transaction 1: Create and initialize mint
            const transaction = new Transaction().add(
                SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: mintKeypair.publicKey,
                    space: mintLen,
                    lamports,
                    programId: TOKEN_2022_PROGRAM_ID,
                }),
                createInitializeMetadataPointerInstruction(
                    mintKeypair.publicKey, 
                    wallet.publicKey, 
                    mintKeypair.publicKey, 
                    TOKEN_2022_PROGRAM_ID
                ),
                createInitializeMintInstruction(
                    mintKeypair.publicKey, 
                    9, 
                    wallet.publicKey, 
                    null, 
                    TOKEN_2022_PROGRAM_ID
                ),
                createInitializeInstruction({
                    programId: TOKEN_2022_PROGRAM_ID,
                    mint: mintKeypair.publicKey,
                    metadata: mintKeypair.publicKey,
                    name: metadata.name,
                    symbol: metadata.symbol,
                    uri: metadata.uri,
                    mintAuthority: wallet.publicKey,
                    updateAuthority: wallet.publicKey,
                }),
            );

            transaction.feePayer = wallet.publicKey;
            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            transaction.partialSign(mintKeypair);
            await wallet.sendTransaction(transaction, connection);

            // Transaction 2: Create ATA
            const associatedToken = getAssociatedTokenAddressSync(
                mintKeypair.publicKey,
                wallet.publicKey,
                false,
                TOKEN_2022_PROGRAM_ID,
            );

            const transaction2 = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    wallet.publicKey,
                    associatedToken,
                    wallet.publicKey,
                    mintKeypair.publicKey,
                    TOKEN_2022_PROGRAM_ID,
                ),
            );
            await wallet.sendTransaction(transaction2, connection);

            // Transaction 3: Mint tokens
            const supplyAmount = BigInt(Math.floor(parseFloat(initialSupply) * 10**9));
            const transaction3 = new Transaction().add(
                createMintToInstruction(
                    mintKeypair.publicKey, 
                    associatedToken, 
                    wallet.publicKey, 
                    supplyAmount, 
                    [], 
                    TOKEN_2022_PROGRAM_ID
                )
            );
            await wallet.sendTransaction(transaction3, connection);

            setTokenAddress(mintKeypair.publicKey.toBase58());
            console.log(`Token created at ${mintKeypair.publicKey.toBase58()}`);
        } catch (err) {
            setError(`Failed to create token: ${err.message}`);
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
            gap: '20px'
        }}>
            <h1>Solana Token Launchpad</h1>
            <input 
                className='inputText' 
                type='text' 
                placeholder='Name' 
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
            />
            <input 
                className='inputText' 
                type='text' 
                placeholder='Symbol (max 10 chars)'
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={isLoading}
            />
            <input 
                className='inputText' 
                type='text' 
                placeholder='Metadata URL'
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                disabled={isLoading}
            />
            <input 
                className='inputText' 
                type='number' 
                placeholder='Initial Supply'
                value={initialSupply}
                onChange={(e) => setInitialSupply(e.target.value)}
                disabled={isLoading}
            />
            <button 
                onClick={createToken} 
                className='btn'
                disabled={isLoading}
            >
                {isLoading ? 'Creating...' : 'Create Token'}
            </button>
            
            {error && <p style={{color: 'red'}}>{error}</p>}
            {tokenAddress && (
                <p style={{color: 'green'}}>
                    Token created successfully! Address: {tokenAddress}
                </p>
            )}
        </div>
    );
}