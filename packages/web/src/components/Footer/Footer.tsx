import { MDBContainer, MDBFooter } from "mdbreact";
import * as React from "react";
import "./footer.css";

const FooterPage = () => {
  return (
    <MDBFooter color="blue" className="font-small pt-4 mt-4">
      <div className="footer footer-copyright text-center py-3">
        <MDBContainer fluid={true}>
          Copyright &copy; 2020 Praveen Antony
        </MDBContainer>
      </div>
    </MDBFooter>
  );
};

export default FooterPage;
