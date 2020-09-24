import {
  makeRandomPrivKey,
  getAddressFromPrivateKey,
  TransactionVersion,
} from '@blockstack/stacks-transactions';
import { POX } from './pox';
import { Api } from '../../api/api';
import BN from 'bn.js';

const client = new POX();
const api = new Api('http://localhost:3999/extended/');

const waitForTxConfirm = (txid: string) => {
  const getTX = async (resolve: (data: unknown) => void, interval: number) => {
    const txResponse = await api.getTxDetails(txid);
    if (txResponse.data.tx_status === 'success') {
      clearInterval(interval);
      return resolve(true);
    }
  };
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const getTX = async (interval: number) => {
        const txResponse = await api.getTxDetails(txid);
        if (txResponse.data.tx_status === 'success') {
          clearInterval(interval);
          return resolve(true);
        } else if (txResponse.data.tx_status === 'abort_by_response') {
          clearInterval(interval);
          return reject(txResponse.data.tx_result);
        }
      };
      void getTX(interval);
    }, 500);
  });
};

test.only('making a lock-stx transaction', async () => {
  const key = makeRandomPrivKey();
  const address = getAddressFromPrivateKey(key.data, TransactionVersion.Testnet);
  const faucetResponse = await api.getFaucetStx(address);
  await waitForTxConfirm(faucetResponse.data.txId);
  const lockTxid = await client.lockSTX({
    amountSTX: 50500000010000 + 500,
    cycles: 1,
    // todo: real BTC address
    poxAddress: 'asdf',
    key: key.data.toString('hex'),
  });
  await waitForTxConfirm(`0x${lockTxid as string}`);
  const stackerInfo = await client.getStackerInfo(address);
  console.log('Stacker Info:');
  console.log('Amount Locked:', stackerInfo.amountSTX.toString(10));
  console.log('Lock Period:', stackerInfo.lockPeriod.toString(10));
  console.log('Address Version:', stackerInfo.poxAddr.version.toString('hex'));
  console.log('Address Hashbytes:', stackerInfo.poxAddr.hashbytes.toString('hex'));
  expect(stackerInfo.amountSTX.eq(new BN(50500000010000 + 500, 10))).toBeTruthy();
  expect(stackerInfo.lockPeriod.eq(new BN(1, 10))).toBeTruthy();
  expect(stackerInfo.poxAddr.version).toEqual(new Buffer('01', 'hex'));
  // TODO: tests for BTC Address
}, 25_000);
