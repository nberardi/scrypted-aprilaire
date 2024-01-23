import { FunctionalDomain, convertTemperatureToByte, FunctionalDomainScheduling, convertByteToTemperature } from "./AprilaireClient";
import { BasePayloadRequest } from "./BasePayloadRequest";
import { BasePayloadResponse } from "./BasePayloadResponse";
import { FanModeSetting } from "./FunctionalDomainControl";

/*
*
* Functional Domain: Messaging
* Byte: 0x09
*
* Attribute                           |   Byte    |   COS |   R/W |   Implimented
* ------------------------------------|-----------|-------|-------|---------------
* Permanent Messages                  |   0x01    |   No  |   R/W |   
* Temporary Messages                  |   0x02    |   No  |   R/W |   
*
*/