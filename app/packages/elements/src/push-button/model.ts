import type { ModelFactory } from "../api";
import { init } from "../shared/modelKit";
import { SwitchModel } from "../switch/model";

export const pushButtonModel: ModelFactory = (el) => init(new SwitchModel(el, "push-button"), el);
