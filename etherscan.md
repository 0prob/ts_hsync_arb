> ## Documentation Index
> Fetch the complete documentation index at: https://docs.etherscan.io/llms.txt
> Use this file to discover all available pages before exploring further.

# Get Contract ABI

> Retrieve the ABI for a verified smart contract.

export const chain = '1';

### Query Parameters

<ParamField query="apikey" type="string" default="YourApiKeyToken">
  Your Etherscan API key.
</ParamField>

<ParamField query="chainid" type="string" default="1">
  Chain ID to query, eg `1` for Ethereum, `8453` for Base from our [supported chains](/supported-chains).
</ParamField>

<ParamField query="module" type="string" default="contract">
  Set to `contract` for this endpoint.
</ParamField>

<ParamField query="action" type="string" default="getabi">
  Set to `getabi` for this endpoint.
</ParamField>

<ParamField query="address" type="string" default="0xBB9bc244D798123fDe783fCc1C72d3Bb8C189413">
  The contract address to query.
</ParamField>

<ResponseExample>
  ```json Response theme={null}
  {
    "status": "1",
    "message": "OK",
    "result": "[{\"constant\":false,\"inputs\":[{\"name\":\"_c\",\"type\":\"string\"}],\"name\":\"enterValue\",\"outputs\":[],\"payable\":false,\"stateMutability\":\"nonpayable\",\"type\":\"function\"},{\"constant\":true,\"inputs\":[],\"name\":\"test\",\"outputs\":[{\"name\":\"\",\"type\":\"string\"}],\"payable\":false,\"stateMutability\":\"view\",\"type\":\"function\"}]"
  }
  ```
</ResponseExample>
