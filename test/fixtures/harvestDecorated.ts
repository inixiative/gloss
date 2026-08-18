import { thing } from './thing';

export class Panel {
  @observable
  render() {
    // renders the panel straight from thing
    return thing;
  }
}
