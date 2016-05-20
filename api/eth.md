# ETH

### status

  - `number` networkId
  - `Buffer` td
  - `Buffer` bestHash
  - `Buffer` genesisHash

<hr>

### Events

#### error

  - `Error` err

#### status

  - `Status` status

#### message

  - `number` code
  - `*[]` payload

<hr>

### getVersion

returns: `number`

### sendStatus

  - `Status` status

### sendMessage

  - `number` code
  - `*[]` payload
