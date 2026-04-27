```bash
graphify explain sendTx\(\)
```

Node: sendTx()
  ID:        send_tx_sendtx
  Source:    src/execution/send_tx.ts L255
  Type:      code
  Community: 15
  Degree:    10

Connections (10):
  --> send_tx.ts [contains] [EXTRACTED]
  --> .next() [calls] [INFERRED]
  --> .resync() [calls] [INFERRED]
  --> .revert() [calls] [INFERRED]
  --> .confirm() [calls] [INFERRED]
  --> clearTrackedReceipt() [calls] [EXTRACTED]
  --> trackSubmittedTx() [calls] [EXTRACTED]
  --> classifySubmissionError() [calls] [EXTRACTED]
  --> logFailure() [calls] [EXTRACTED]
  --> dryRun() [calls] [EXTRACTED]
