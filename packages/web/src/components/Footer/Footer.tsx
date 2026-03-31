import * as React from "react";

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        textAlign: "center",
        fontSize: "12px",
        color: "#9CA3AF",
        padding: "16px 0",
        opacity: 0.75,
      }}
    >
      &copy; {year} Praveen Antony
    </footer>
  );
};

export default Footer;
