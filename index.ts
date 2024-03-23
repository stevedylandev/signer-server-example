import express, { Express,  } from "express";
import * as ed from "@noble/ed25519";
import { mnemonicToAccount } from "viem/accounts";

const SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN = {
    name: "Farcaster SignedKeyRequestValidator",
    version: "1",
    chainId: 10,
    verifyingContract: "0x00000000fc700472606ed4fa22623acf62c60553",
  } as const;
  
  const SIGNED_KEY_REQUEST_TYPE = [
    { name: "requestFid", type: "uint256" },
    { name: "key", type: "bytes" },
    { name: "deadline", type: "uint256" },
  ] as const;


const app: Express = express();
const port = process.env.PORT || 3000;
export const signInWithWarpcast = async () => {
  const privateKeyBytes = ed.utils.randomPrivateKey();
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);
  
  const keypairString = {
    publicKey: "0x" + Buffer.from(publicKeyBytes).toString("hex"),
    privateKey: "0x" + Buffer.from(privateKeyBytes).toString("hex"),
  };
  const appFid = process.env.FARCASTER_DEVELOPER_FID!;
  const account = mnemonicToAccount(
    process.env.FARCASTER_DEVELOPER_MNEMONIC!
  );

  const deadline = Math.floor(Date.now() / 1000) + 86400; // signature is valid for 1 day
  const requestFid = parseInt(appFid);
  const signature = await account.signTypedData({
    domain: SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
    types: {
      SignedKeyRequest: SIGNED_KEY_REQUEST_TYPE,
    },
    primaryType: "SignedKeyRequest",
    message: {
      requestFid: BigInt(appFid),
      key: keypairString.publicKey as `0x`,
      deadline: BigInt(deadline),
    },
  });
  const authData = {
    signature: signature,
    requestFid: requestFid,
    deadline: deadline,
    requestSigner: account.address,

  }
  const {
    result: { signedKeyRequest },
  } = (await (
    await fetch(`https://api.warpcast.com/v2/signed-key-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: keypairString.publicKey,
        signature,
        requestFid,
        deadline,
      }),
    })
  ).json()) as {
    result: { signedKeyRequest: { token: string; deeplinkUrl: string } };
  };
  const user: any = {
    ...authData,
    publicKey: keypairString.publicKey,
    deadline: deadline,
    token: signedKeyRequest.token,
    signerApprovalUrl: signedKeyRequest.deeplinkUrl,
    privateKey: keypairString.privateKey,
    status: "pending_approval",
  };
  return user;

};

app.use(express.json());

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});

app.post("/sign-in", async (req: express.Request, res: express.Response) => {
  try {
    const signInData = await signInWithWarpcast();
    if(!signInData) {
      res.status(500).json({error: "Failed to sign in user"});
    }
    if(signInData) {
      res.json({
        deepLinkUrl: signInData?.signerApprovalUrl, 
        pollingToken: signInData?.token,
        publicKey: signInData?.publicKey,
        privateKey: signInData?.privateKey,
      });
    }
    else{
      res.status(500).json({error: "Failed to get farcaster user"});
    }
  } catch (error) {
    res.status(500).json({error: error});
  }
});

app.get("/sign-in/poll", async (req: express.Request, res: express.Response) => {
  const {pollingToken} = req.query;
    try {
      const fcSignerRequestResponse = await fetch(
        `https://api.warpcast.com/v2/signed-key-request?token=${pollingToken}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      const responseBody = (await fcSignerRequestResponse.json()) as {
        result: { signedKeyRequest:  any};
      };
      console.log(responseBody)
      res.status(200).json({"state": responseBody.result.signedKeyRequest.state, "userFid": responseBody.result.signedKeyRequest.userFid});
    }
    catch (error) {
      res.status(500).json(error);
    }
  }
);
