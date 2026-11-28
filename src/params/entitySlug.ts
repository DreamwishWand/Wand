export const match=(param:string)=>/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(param)&&!/^[0-9]+$/.test(param);
