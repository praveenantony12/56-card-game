import * as io from "socket.io-client";

export class Socket {
  public static openClientConnection() {
    const socketUrl = process.env.TEST_SOCKET_URL || "http://localhost:4500";
    return io(socketUrl);
  }

  public static sendData(
    ioClient: SocketIOClient.Socket,
    data: any,
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
