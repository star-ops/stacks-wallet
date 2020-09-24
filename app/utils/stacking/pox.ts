import axios from 'axios';
import {
  makeContractCall,
  bufferCV,
  uintCV,
  tupleCV,
  StacksTestnet,
  broadcastTransaction,
  standardPrincipalCV,
  serializeCV,
  deserializeCV,
  TupleCV,
} from '@blockstack/stacks-transactions';
import { randomBytes } from 'crypto';
import BN from 'bn.js';

interface POXInfo {
  contract_id: string;
  first_burnchain_block_height: number;
  min_amount_ustx: number;
  registration_window_length: 250;
  rejection_fraction: number;
  reward_cycle_id: number;
  reward_cycle_length: number;
}

interface StackerInfo {
  amountSTX: BN;
  firstRewardCycle: BN;
  lockPeriod: BN;
  poxAddr: {
    version: Buffer;
    hashbytes: Buffer;
  };
}

export class POX {
  nodeURL = 'http://localhost:3999';

  async getPOXInfo(): Promise<POXInfo> {
    const url = `${this.nodeURL}/v2/pox`;
    const res = await axios.get<POXInfo>(url);
    return res.data;
  }

  async lockSTX({
    amountSTX,
    // poxAddress,
    cycles,
    key,
  }: {
    key: string;
    cycles: number;
    poxAddress: string;
    amountSTX: number;
  }) {
    const info = await this.getPOXInfo();
    const contract = info.contract_id;
    // TODO: actuall parse BTC address into version, checksum
    const version = bufferCV(Buffer.from('01', 'hex'));
    const hashbytes = bufferCV(randomBytes(20));
    const address = tupleCV({
      hashbytes,
      version,
    });
    const [contractAddress, contractName]: string[] = contract.split('.');
    const network = new StacksTestnet();
    network.coreApiUrl = 'http://localhost:3999';
    const txOptions = {
      contractAddress,
      contractName,
      functionName: 'stack-stx',
      functionArgs: [uintCV(amountSTX), address, uintCV(cycles)],
      senderKey: key,
      validateWithAbi: true,
      network,
    };
    const tx = await makeContractCall(txOptions);
    const res = await broadcastTransaction(tx, network);
    return res;
  }

  async getStackerInfo(address: string): Promise<StackerInfo> {
    const info = await this.getPOXInfo();
    const args = [`0x${serializeCV(standardPrincipalCV(address)).toString('hex')}`];
    const res = await this.callReadOnly({
      contract: info.contract_id,
      args,
      functionName: 'get-stacker-info',
    });
    const cv = deserializeCV(Buffer.from(res.slice(2), 'hex')) as TupleCV;
    // Not sure why these types are off
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const data = cv.value.data;
    return {
      lockPeriod: data['lock-period'].value,
      amountSTX: data['amount-ustx'].value,
      firstRewardCycle: data['first-reward-cycle'].value,
      poxAddr: {
        version: data['pox-addr'].data.version.buffer,
        hashbytes: data['pox-addr'].data.hashbytes.buffer,
      },
    };
  }

  async callReadOnly({
    contract,
    functionName,
    args,
  }: {
    contract: string;
    functionName: string;
    args: string[];
  }) {
    const [contractAddress, contractName] = contract.split('.');
    const url = `${this.nodeURL}/v2/contracts/call-read/${contractAddress}/${contractName}/${functionName}`;
    const body = {
      sender: 'ST384HBMC97973427QMM58NY2R9TTTN4M599XM5TD',
      arguments: args,
    };
    // Note: must include this custom header - the default Axios one for JSON
    // is not accepted by the core node.
    const response = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data.result as string;
  }
}
