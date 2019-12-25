import { Address, BigInt } from '@graphprotocol/graph-ts';
import {
  setContractsInfo,
  setTemplatesInfo,
} from '../../contractsInfo';

import { Avatar } from '../../types/Controller/Avatar';
import { DAOFactory, InitialSchemesSet, NewOrg, ProxyCreated, SchemeInstance } from '../../types/DAOFactory/DAOFactory';
import {
  AvatarContract, ContractInfo, DAOFactoryContract,
} from '../../types/schema';
import { createTemplate, fetchTemplateName, setContractInfo } from '../../utils';

export function getDAOFactoryContract(address: Address): DAOFactoryContract {
  let daoFactory = DAOFactoryContract.load(address.toHex()) as DAOFactoryContract;
  if (daoFactory == null) {
    daoFactory = new DAOFactoryContract(address.toHex());
    daoFactory.address = address;
    let daoFactoryContract = DAOFactory.bind(address);
    daoFactory.packageName = daoFactoryContract.PACKAGE_NAME();
    daoFactory.app = daoFactoryContract.app();
    daoFactory.save();
    setContractsInfo();
    setTemplatesInfo();
  }
  return daoFactory;
}

export function handleNewOrg(event: NewOrg): void {
  // Ensure the DAOTrackerContract has been added to the store
  getDAOFactoryContract(event.address);

  let avatar = event.params._avatar;

  // If the avatar already exists, early out
  if (AvatarContract.load(avatar.toHex()) != null) {
    return;
  }

  let avatarContract = Avatar.bind(avatar);
  let controller = avatarContract.owner();
  let reputation = avatarContract.nativeReputation();
  let daoToken = avatarContract.nativeToken();
  let arcVersion: string;

  let avatarInfo = ContractInfo.load(avatar.toHex());
  if (avatarInfo != null) {
    arcVersion = avatarInfo.version;
  } else {
    // We've chosen to disable tracking new DAOs that don't come from the DaoCreator,
    // as it's a potential security vulnerability
    return;
  }

  let avatarTemplate = fetchTemplateName('Avatar', arcVersion);
  let controllerTemplate = fetchTemplateName('Controller', arcVersion);
  let reputationTemplate = fetchTemplateName('Reputation', arcVersion);
  let daoTokenTemplate = fetchTemplateName('DAOToken', arcVersion);

  let missingTemplate = avatarTemplate == null ||
                        controllerTemplate == null ||
                        reputationTemplate == null ||
                        daoTokenTemplate == null;

  if (missingTemplate) {
    // We're missing a template version in the subgraph
    return;
  }

  // Tell the subgraph to start indexing events from the:
  // Avatar, Controller, DAOToken, and Reputation contracts
  createTemplate(avatarTemplate, avatar);
  createTemplate(reputationTemplate, reputation);
  createTemplate(daoTokenTemplate, daoToken);
  createTemplate(controllerTemplate, controller);

  // Note, no additional work is needed here because...
  // * ControllerOrganization is added to the store by the 'RegisterScheme' event
  // * AvatarContract, ReputationContract, and TokenContract are added to the store
  //   by the 'RegisterScheme' or 'OwnershipTransfered' events
}

export function handleSchemeInstance(event: SchemeInstance): void {
  let schemeInfo = ContractInfo.load(event.params._scheme.toHex());
  if (schemeInfo != null) {
    schemeInfo.name = event.params._name.toHex(); // TODO: In Arc, make this not indexed
    schemeInfo.alias = event.params._name.toHex();
    schemeInfo.save();

    let schemeTemplate = fetchTemplateName(schemeInfo.name, schemeInfo.version);

    if (schemeTemplate == null) {
      // We're missing a template version in the subgraph
      return;
    }

    // Tell the subgraph to start indexing events from the:
    // Avatar, Controller, DAOToken, and Reputation contracts
    createTemplate(schemeTemplate, schemeInfo.address as Address);
  }
}

export function handleProxyCreated(event: ProxyCreated): void {
  let fullVersion = event.params._version;
  let version = '0.1.1-rc.' + fullVersion[2].toString();
  setContractInfo(event.params._proxy.toHex(), 'Proxy', event.params._proxy.toHex(), version.toString());
}