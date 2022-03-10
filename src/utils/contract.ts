import { Web3Provider } from '@ethersproject/providers'
// import { Contract } from '@ethersproject/contracts'
import { isAddress, toBN } from 'web3-utils'
import { getWeb3Library } from './getLibrary'
import InfinityERC20 from '../constants/abis/app/InfinityERC20.json'
import AnyswapERC20 from '../constants/abis/app/AnyswapV6ERC20.json'
import AnyswapV6Router from '../constants/abis/app/AnyswapV6Router.json'
import RouterConfig from '../constants/abis/app/RouterConfig.json'

const doNothing = () => null

export const isValidAddressFormat = (address: string) => {
  return typeof address === 'string' && /^0x[A-Fa-f0-9]{40}$/.test(address)
}

export const isValidAddress = (library: Web3Provider, address: string) => {
  if (!isValidAddressFormat(address) || !library) return false

  try {
    return isAddress(address)
  } catch (error) {
    console.error(error)
    return false
  }
}

export const getContractInstance = (library: Web3Provider, address: string, abi: any) => {
  const web3 = getWeb3Library(library.provider)

  return new web3.eth.Contract(abi, address)
}

export const deployContract = async (params: any) => {
  const { abi, byteCode, library, account, onDeploy = doNothing, onHash = doNothing, deployArguments } = params

  let contract

  try {
    const web3 = getWeb3Library(library.provider)

    contract = new web3.eth.Contract(abi)

    const transaction = contract.deploy({
      data: byteCode,
      arguments: deployArguments
    })

    const gas = await transaction.estimateGas({ from: account })

    return await transaction
      .send({
        from: account,
        gas
      })
      .on('transactionHash', (hash: string) => onHash(hash))
      .on('error', (error: any) => console.error(error))
      .on('receipt', (receipt: any) => onDeploy(receipt))
  } catch (error) {
    throw error
  }
}

export const deployInfinityERC20 = async (params: any) => {
  const { library, account, onHash, name, symbol, decimals } = params
  const { abi, bytecode } = InfinityERC20

  return deployContract({
    abi,
    byteCode: bytecode,
    deployArguments: [name, symbol, decimals],
    library,
    account,
    onHash
  })
}

export const deployAnyswapERC20 = async (params: any) => {
  const { library, account, onHash, name, symbol, decimals, underlying, vault, minter } = params
  const { abi, bytecode } = AnyswapERC20

  return deployContract({
    abi,
    byteCode: bytecode,
    deployArguments: [name, symbol, decimals, underlying, vault, minter],
    library,
    account,
    onHash
  })
}

export const deployAnyswapRouter = async (params: any) => {
  const { library, account, onHash, factory, wNative, mpc } = params
  const { abi, bytecode } = AnyswapV6Router

  return deployContract({
    abi,
    byteCode: bytecode,
    deployArguments: [factory, wNative, mpc],
    library,
    account,
    onHash
  })
}

export const deployRouterConfig = async (params: any) => {
  const { library, onHash, account } = params
  const { abi, bytecode } = RouterConfig

  return deployContract({
    abi,
    byteCode: bytecode,
    deployArguments: [],
    library,
    account,
    onHash
  })
}

export const addToken = async (params: {
  chainId: number
  toChainId: number
  mpc: string
  mpcPubKey: string
  library: any
  account: string
  name: string
  symbol: string
  decimals: number
  underlying: string
  vault: string
  minter: string
  routerConfig: string
  onHash?: (hash: string) => void
}) => {
  const {
    chainId,
    toChainId,
    mpc,
    mpcPubKey,
    library,
    account,
    name,
    symbol,
    decimals,
    underlying,
    vault,
    minter,
    onHash,
    routerConfig
  } = params

  try {
    const anyswapERC20 = await deployAnyswapERC20({
      library,
      account,
      name,
      symbol,
      decimals,
      underlying,
      vault,
      minter,
      onHash
    })

    const web3 = getWeb3Library(library.provider)
    const { abi } = RouterConfig
    //@ts-ignore
    const configContract = new web3.eth.Contract(abi, routerConfig)

    // what is tokenID format?
    const sourceTokenId = `${chainId}${name.toUpperCase()}`
    // (tokenID, chainID, TokenConfig)
    const tokenConfigResult = await configContract.methods.setTokenConfig(sourceTokenId, chainId, {
      Decimals: decimals,
      ContractAddress: anyswapERC20.options.address,
      ContractVersion: 6
    })

    const targetTokenId = `${toChainId}${name.toUpperCase()}`
    // (tokenID, toChainID, SwapConfig)
    const multiplier = toBN(10).mul(toBN(18))
    const swapConfigResult = await configContract.methods.setSwapConfig(targetTokenId, toChainId, {
      MaximumSwap: toBN(1_000_000)
        .mul(multiplier)
        .toString(),
      MinimumSwap: toBN(100)
        .mul(multiplier)
        .toString(),
      BigValueThreshold: toBN(100_000)
        .mul(multiplier)
        .toString(),
      SwapFeeRatePerMillion: '1000',
      MaximumSwapFee: toBN(10)
        .mul(multiplier)
        .toString(),
      MinimumSwapFee: toBN(1.5)
        .mul(multiplier)
        .toString()
    })

    // (addr, pubKey)
    const mpcKeyResult = await configContract.methods.setMPCPubkey(mpc, mpcPubKey)

    return !!(tokenConfigResult && swapConfigResult && mpcKeyResult)
  } catch (error) {
    console.error(error)
    return false
  }
}
