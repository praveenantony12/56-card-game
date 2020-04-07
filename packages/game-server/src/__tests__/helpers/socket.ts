import * as io from "socket.io-client";

export class Socket {
  public static openClientConnection() {
    return io("http://192.168.1.220:3000");
    // return io("http://75.177.132.239:70/");
  }

  public static sendData(
    ioClient: SocketIOClient.Socket,
    data: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      ioClient.emit("data", data, (err, result) => {
        if (err) {
          return reject(err);
        }
        resolve(result);
      });
    });
  }

  public static closeClientConnection(ioClient: SocketIOClient.Socket) {
    ioClient.close();
  }
}
